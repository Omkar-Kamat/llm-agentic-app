import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { ensureLearner } from "@/lib/learners";
import { Profile } from "@/lib/contracts";
import { embedDocuments } from "@/lib/llm/embed";
import { db } from "@/lib/db/client";
import { learners } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
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

  await ensureLearner(user.id);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = Profile.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues },
      { status: 400 }
    );
  }

  const profile = parsed.data;
  const { targetRole, currentRole, skills, goalSummary, hoursPerWeek } = profile;
  const skillNames = skills.map((s) => s.name).join(", ");
  const embeddingText = `${targetRole}. Current role: ${currentRole}. Skills: ${skillNames}. Goal: ${goalSummary}`;

  const [profileEmbedding] = await embedDocuments([embeddingText]);

  if (!profileEmbedding) {
    return NextResponse.json(
      { error: "Failed to generate embedding" },
      { status: 500 }
    );
  }

  await db
    .update(learners)
    .set({
      goal: goalSummary,
      hoursPerWeek,
      profileJson: profile,
      profileEmbedding,
    })
    .where(eq(learners.id, user.id));

  return NextResponse.json({ ok: true });
}
