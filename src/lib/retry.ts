export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EPIPE",
  "ERR_NETWORK",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);

const NETWORK_ERROR_NAMES = new Set([
  "NetworkError",
  "FetchError",
  "TimeoutError",
]);

function hasNetworkMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("socket hang up") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound") ||
    lower.includes("connection reset") ||
    lower.includes("connection refused") ||
    lower.includes("connection timeout") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  );
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;

  if (typeof err === "string") {
    return hasNetworkMessage(err);
  }

  if (typeof err !== "object") return false;

  const error = err as Record<string, unknown>;

  if (error.name === "AbortError") {
    return false;
  }

  if (error.isNetworkError === true || error.network === true) {
    return true;
  }

  const code =
    error.code ||
    (error.cause && typeof error.cause === "object"
      ? (error.cause as Record<string, unknown>).code
      : undefined);

  if (typeof code === "string" && NETWORK_ERROR_CODES.has(code.toUpperCase())) {
    return true;
  }

  if (typeof error.name === "string" && NETWORK_ERROR_NAMES.has(error.name)) {
    return true;
  }

  if (typeof error.message === "string" && hasNetworkMessage(error.message)) {
    return true;
  }

  if (err instanceof TypeError && typeof error.message === "string") {
    const msg = error.message.toLowerCase();
    if (msg.includes("fetch") || msg.includes("network")) {
      return true;
    }
  }

  if (error.cause && error.cause !== err && typeof error.cause === "object") {
    return isNetworkError(error.cause);
  }

  return false;
}

function toValidStatus(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isInteger(val) && val >= 100 && val <= 599) {
    return val;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{3}$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      if (parsed >= 100 && parsed <= 599) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;

  const error = err as Record<string, unknown>;

  const direct = toValidStatus(error.status ?? error.statusCode);
  if (direct !== undefined) return direct;

  if (error.response && typeof error.response === "object") {
    const res = error.response as Record<string, unknown>;
    const resStatus = toValidStatus(res.status ?? res.statusCode);
    if (resStatus !== undefined) return resStatus;
  }

  if (error.cause && error.cause !== err && typeof error.cause === "object") {
    const causeStatus = extractHttpStatus(error.cause);
    if (causeStatus !== undefined) return causeStatus;
  }

  if (typeof error.message === "string") {
    const match = error.message.match(/\b(429|5\d{2})\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const clientMatch = error.message.match(/\b(4\d{2})\b/);
    if (clientMatch) {
      return parseInt(clientMatch[1], 10);
    }
  }

  return undefined;
}

export function defaultShouldRetry(err: unknown): boolean {
  const status = extractHttpStatus(err);
  if (status !== undefined) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  return isNetworkError(err);
}

function getHeader(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== "object") return undefined;

  if ("get" in headers && typeof (headers as { get: unknown }).get === "function") {
    const val = (headers as Headers).get(name);
    if (val !== null && val !== undefined) return val;
  }

  const record = headers as Record<string, unknown>;
  const lower = name.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      return record[key];
    }
  }

  return undefined;
}

function parseRetryAfterHeader(val: unknown): number | undefined {
  if (typeof val === "number") {
    return val >= 0 ? val * 1000 : undefined;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    const num = Number(trimmed);
    if (!isNaN(num) && num >= 0) {
      return num * 1000;
    }

    const dateMs = Date.parse(trimmed);
    if (!isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  return undefined;
}

function parseRetryAfterValue(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;

  if (val instanceof Date) {
    return Math.max(0, val.getTime() - Date.now());
  }

  if (typeof val === "number") {
    if (isNaN(val) || val < 0) return undefined;
    return val <= 120 ? val * 1000 : val;
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    if (trimmed.endsWith("ms")) {
      const parsed = parseFloat(trimmed.slice(0, -2));
      return isNaN(parsed) || parsed < 0 ? undefined : parsed;
    }

    if (trimmed.endsWith("s")) {
      const parsed = parseFloat(trimmed.slice(0, -1));
      return isNaN(parsed) || parsed < 0 ? undefined : parsed * 1000;
    }

    const num = Number(trimmed);
    if (!isNaN(num)) {
      if (num < 0) return undefined;
      return num <= 120 ? num * 1000 : num;
    }

    const dateMs = Date.parse(trimmed);
    if (!isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }

  return undefined;
}

function extractRetryDelayFromGoogleDetails(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const item of details) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const type = String(rec["@type"] ?? "");
      if (type.includes("RetryInfo") && rec.retryDelay) {
        const parsed = parseRetryAfterValue(rec.retryDelay);
        if (parsed !== undefined) return parsed;
      }
    }
  }
  return undefined;
}

export function getRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;

  const error = err as Record<string, unknown>;

  // 1. Explicit millisecond headers/properties
  const msHeader =
    getHeader(error.headers, "retry-after-ms") ??
    (error.response && typeof error.response === "object"
      ? getHeader((error.response as Record<string, unknown>).headers, "retry-after-ms")
      : undefined) ??
    getHeader(error.responseHeaders, "retry-after-ms") ??
    error.retryAfterMs ??
    error["retry-after-ms"];

  if (msHeader !== undefined && msHeader !== null) {
    const ms = typeof msHeader === "number" ? msHeader : parseFloat(String(msHeader));
    if (!isNaN(ms) && ms >= 0) {
      return ms;
    }
  }

  // 2. Retry-After headers
  const headerVal =
    getHeader(error.headers, "retry-after") ??
    (error.response && typeof error.response === "object"
      ? getHeader((error.response as Record<string, unknown>).headers, "retry-after")
      : undefined) ??
    getHeader(error.responseHeaders, "retry-after");

  if (headerVal !== undefined && headerVal !== null) {
    const parsed = parseRetryAfterHeader(headerVal);
    if (parsed !== undefined) return parsed;
  }

  // 3. Retry-After property on error
  const valProp = error.retryAfter ?? error["retry-after"] ?? error.retry_after;
  if (valProp !== undefined && valProp !== null) {
    const parsed = parseRetryAfterValue(valProp);
    if (parsed !== undefined) return parsed;
  }

  // 4. Response data property
  if (error.response && typeof error.response === "object") {
    const res = error.response as Record<string, unknown>;
    if (res.data && typeof res.data === "object") {
      const data = res.data as Record<string, unknown>;
      const dataVal = data.retryAfter ?? data["retry-after"] ?? data.retry_after;
      if (dataVal !== undefined && dataVal !== null) {
        const parsed = parseRetryAfterValue(dataVal);
        if (parsed !== undefined) return parsed;
      }
    }
  }

  // 5. Google RPC / Gemini API RetryInfo (in details or nested error)
  const fromDirectDetails =
    extractRetryDelayFromGoogleDetails(error.details) ??
    extractRetryDelayFromGoogleDetails(
      (error.error as Record<string, unknown> | undefined)?.details
    );
  if (fromDirectDetails !== undefined) {
    return fromDirectDetails;
  }

  // 6. JSON stringified error or error message regex
  if (typeof error.message === "string") {
    const raw = error.message.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        const fromParsedDetails =
          extractRetryDelayFromGoogleDetails(parsed.details) ??
          extractRetryDelayFromGoogleDetails(parsed.error?.details);
        if (fromParsedDetails !== undefined) {
          return fromParsedDetails;
        }
      } catch {
        // ignore parse error and proceed to regex check
      }
    }

    const match =
      error.message.match(/retry in\s+([0-9.]+)\s*s/i) ||
      error.message.match(/retry after\s+([0-9.]+)\s*s/i);
    if (match) {
      const sec = parseFloat(match[1]);
      if (!isNaN(sec) && sec >= 0) {
        return Math.ceil(sec * 1000);
      }
    }
  }

  // 7. Cause check recursively
  if (error.cause && error.cause !== err && typeof error.cause === "object") {
    return getRetryAfterMs(error.cause);
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    retries?: number;
    baseMs?: number;
    shouldRetry?: (err: unknown) => boolean;
  }
): Promise<T> {
  const retries = opts?.retries ?? 4;
  const baseMs = opts?.baseMs ?? 800;
  const shouldRetry = opts?.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt >= retries || !shouldRetry(err)) {
        throw err;
      }

      const backoff = baseMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseMs;
      const calculatedDelay = backoff + jitter;

      const retryAfterMs = getRetryAfterMs(err);
      const waitMs =
        retryAfterMs !== undefined
          ? Math.max(calculatedDelay, retryAfterMs)
          : calculatedDelay;

      if (waitMs >= 2000) {
        console.warn(
          `[withRetry] Rate limited (attempt ${attempt + 1}/${retries}). Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`
        );
      }

      await sleep(waitMs);
      attempt++;
    }
  }
}
