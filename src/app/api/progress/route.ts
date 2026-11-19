import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { ProgressEventInput } from "@/lib/contracts";
import { getLatestPlan } from "@/lib/services/plans";
import { recordProgress } from "@/lib/services/progress";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = ProgressEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid progress event input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  if (
    input.type === "quiz" &&
    (typeof input.score !== "number" || Number.isNaN(input.score))
  ) {
    return NextResponse.json(
      { error: 'Score is required for type "quiz"' },
      { status: 400 }
    );
  }

  if (input.type === "rating" && !input.rating) {
    return NextResponse.json(
      { error: 'Rating is required for type "rating"' },
      { status: 400 }
    );
  }

  const latestPlan = await getLatestPlan(user.id);
  if (!latestPlan) {
    return NextResponse.json(
      { error: "Course is not in learner's latest plan" },
      { status: 400 }
    );
  }

  const courseInPlan = latestPlan.plan.modules?.some(
    (mod) => mod.courseId === input.courseId
  );

  if (!courseInPlan) {
    return NextResponse.json(
      { error: "Course is not in learner's latest plan" },
      { status: 400 }
    );
  }

  await recordProgress(user.id, input);

  return NextResponse.json({ ok: true });
}
