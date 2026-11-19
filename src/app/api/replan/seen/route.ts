import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { markReplansSeen } from "@/lib/services/history";

export async function POST() {
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

  await markReplansSeen(user.id);

  return NextResponse.json({ ok: true });
}
