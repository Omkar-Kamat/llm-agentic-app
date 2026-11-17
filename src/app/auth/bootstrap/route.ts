import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureLearner, getLearner } from "@/lib/learners";

export async function GET() {
  const user = await requireUser();
  await ensureLearner(user.id);
  const learner = await getLearner(user.id);

  if (!learner || learner.profileJson === null) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
