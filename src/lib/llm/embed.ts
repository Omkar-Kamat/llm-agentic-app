import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSION = 768;
export const MODEL_NAME = EMBEDDING_MODEL;
export const OUTPUT_DIMENSIONALITY = EMBEDDING_DIMENSION;

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1200;

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((val) => val / norm);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function embedQuery(text: string): Promise<number[]> {
  const response = await withRetry(() =>
    ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSION,
      },
    })
  );

  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("No embedding values returned from Gemini API");
  }

  return l2Normalize(values);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await withRetry(() =>
      ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: batch,
        config: {
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSION,
        },
      })
    );

    const embeddings = response.embeddings;
    if (!embeddings || embeddings.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} embeddings, received ${embeddings?.length ?? 0}`
      );
    }

    for (const embedding of embeddings) {
      if (!embedding.values) {
        throw new Error("Missing embedding values in response");
      }
      results.push(l2Normalize(embedding.values));
    }

    if (i + BATCH_SIZE < texts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
