import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractResumeText, EmptyResumeError } from "@/lib/resume/extract";
import { buildProfile } from "@/lib/agents/profiler";
import { MAX_OUTPUT_TOKENS } from "@/lib/llm/limits";



const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

const PDF_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
]);

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/docx",
  "application/x-docx",
]);

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 401
    ) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Sign in required",
          },
        },
        { status: 401 }
      );
    }
    throw err;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid multipart form data" } },
      { status: 400 }
    );
  }

  const rawGoalText = formData.get("goalText");
  if (typeof rawGoalText !== "string") {
    return NextResponse.json(
      { error: { message: "goalText is required" } },
      { status: 400 }
    );
  }
  const goalText = rawGoalText.trim();
  if (goalText.length < 10 || rawGoalText.length > 2000 || goalText.length > 2000) {
    return NextResponse.json(
      { error: { message: "goalText must be between 10 and 2000 characters" } },
      { status: 400 }
    );
  }

  const rawHours = formData.get("hoursPerWeek");
  if (typeof rawHours !== "string" || !/^\d+$/.test(rawHours.trim())) {
    return NextResponse.json(
      { error: { message: "hoursPerWeek must be an integer between 1 and 60" } },
      { status: 400 }
    );
  }
  const hoursPerWeek = parseInt(rawHours.trim(), 10);
  if (hoursPerWeek < 1 || hoursPerWeek > 60) {
    return NextResponse.json(
      { error: { message: "hoursPerWeek must be between 1 and 60" } },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  let isFilePresent = false;
  let file: File | null = null;

  if (fileEntry !== null && fileEntry !== undefined) {
    if (typeof fileEntry === "string") {
      if (fileEntry.trim().length > 0) {
        return NextResponse.json(
          { error: { message: "Invalid file" } },
          { status: 400 }
        );
      }
    } else if (fileEntry instanceof File) {
      if (fileEntry.name.trim().length > 0 || fileEntry.size > 0) {
        isFilePresent = true;
        file = fileEntry;
      }
    } else {
      return NextResponse.json(
        { error: { message: "Invalid file" } },
        { status: 400 }
      );
    }
  }

  let resumeText: string | undefined;

  if (isFilePresent && file) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: { message: "File size exceeds 4 MB limit" } },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const mimeType = (file.type || "").split(";")[0].trim().toLowerCase();

    let kind: "pdf" | "docx";
    if (fileName.endsWith(".pdf") && PDF_MIME_TYPES.has(mimeType)) {
      kind = "pdf";
    } else if (fileName.endsWith(".docx") && DOCX_MIME_TYPES.has(mimeType)) {
      kind = "docx";
    } else {
      return NextResponse.json(
        { error: { message: "Only .pdf and .docx files are accepted" } },
        { status: 400 }
      );
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      resumeText = await extractResumeText(buffer, kind);
    } catch (err: unknown) {
      if (err instanceof EmptyResumeError) {
        return NextResponse.json(
          {
            error: {
              code: "RESUME_EMPTY",
              message:
                "No readable text found. Paste your background into the goal box instead.",
            },
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: { message: "Failed to read resume file" } },
        { status: 400 }
      );
    }
  }

  if (MAX_OUTPUT_TOKENS.profiler < 2500) {
    (MAX_OUTPUT_TOKENS as unknown as { profiler: number }).profiler = 2500;
  }

  try {
    const profile = await buildProfile({
      goalText,
      hoursPerWeek,
      resumeText,
    });

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to build profile";
    return NextResponse.json(
      { error: { message } },
      { status: 500 }
    );
  }
}
