import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  replanLearner,
  NoPlanError,
  ProfileMissingError,
} from "@/lib/services/replan";

// Per Next.js 16 docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md):
// Route segment config "runtime" is not compatible with nextConfig.cacheComponents and causes compile failure.
// Cache Components defaults to nodejs runtime.
// export const runtime = "nodejs";
export const maxDuration = 60;

const ReplanSchema = z.object({
  trigger: z.enum(["progress", "manual"]),
});

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
      {
        error: {
          code: "INVALID_JSON",
          message: "Invalid JSON body",
        },
      },
      { status: 400 }
    );
  }

  const parsed = ReplanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          issues: parsed.error.issues,
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await replanLearner({
      learnerId: user.id,
      trigger: parsed.data.trigger,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const isNoPlan =
      err instanceof NoPlanError ||
      (typeof err === "object" &&
        err !== null &&
        ("code" in err
          ? (err as { code: unknown }).code === "NO_PLAN"
          : "name" in err &&
            (err as { name: unknown }).name === "NoPlanError")) ||
      (err instanceof Error && err.message.toLowerCase().includes("no plan"));

    if (isNoPlan) {
      return NextResponse.json(
        {
          error: {
            code: "NO_PLAN",
            message:
              err instanceof Error ? err.message : "No plan found for learner",
          },
        },
        { status: 409 }
      );
    }

    const isProfileMissing =
      err instanceof ProfileMissingError ||
      (typeof err === "object" &&
        err !== null &&
        ("code" in err
          ? (err as { code: unknown }).code === "PROFILE_MISSING"
          : "name" in err &&
            (err as { name: unknown }).name === "ProfileMissingError"));

    if (isProfileMissing) {
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_MISSING",
            message:
              err instanceof Error ? err.message : "Learner profile not found",
          },
        },
        { status: 400 }
      );
    }

    const message = err instanceof Error ? err.message : "Failed to replan";
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
