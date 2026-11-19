import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { getLearner } from "@/lib/learners";
import { getLatestPlan } from "@/lib/services/plans";
import { getCoursesByIds, type Course } from "@/lib/rag/searchCourses";
import { type CriticReport } from "@/lib/contracts";
import { GeneratePlan } from "@/components/GeneratePlan";
import { PlanRoadmap } from "@/components/PlanRoadmap";

export const instant = false;

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getUserOrNull();
  if (!user) {
    redirect("/login");
  }

  const learner = await getLearner(user.id);
  if (!learner || learner.profileJson === null) {
    redirect("/onboarding");
  }

  const latestPlan = await getLatestPlan(user.id);
  const resolvedSearchParams = await searchParams;
  const generateParam = resolvedSearchParams.generate;
  const isGenerateRequested =
    generateParam === "1" ||
    (Array.isArray(generateParam) && generateParam.includes("1"));

  if (!latestPlan || isGenerateRequested) {
    return (
      <div className="container mx-auto px-4 py-8">
        <GeneratePlan />
      </div>
    );
  }

  const courseIds = latestPlan.plan.modules.map((m) => m.courseId);
  const courseList = await getCoursesByIds(courseIds);
  const courses: Record<string, Course> = {};
  for (const course of courseList) {
    courses[course.id] = course;
  }

  const criticReport: CriticReport = latestPlan.criticReport ?? {
    attempts: 1,
    deterministicIssues: [],
    verdict: null,
    warnings: [],
    passed: true,
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <PlanRoadmap
        plan={latestPlan.plan}
        version={latestPlan.version}
        criticReport={criticReport}
        courses={courses}
      />
    </div>
  );
}
