import React from "react";
import { ExternalLink } from "lucide-react";
import { type Plan, type CriticReport } from "@/lib/contracts";
import { type Course } from "@/lib/rag/searchCourses";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PlanRoadmapProps {
  plan: Plan;
  version: number;
  criticReport: CriticReport;
  courses: Record<string, Course>;
}

export function PlanRoadmap({
  plan,
  version,
  criticReport,
  courses,
}: PlanRoadmapProps) {
  const sortedModules = [...(plan.modules || [])].sort(
    (a, b) => a.order - b.order
  );
  const warnings = criticReport?.warnings || [];
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-3 border-b pb-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Learning Plan</h1>
          <span className="text-sm font-medium text-muted-foreground">
            v{version}
          </span>
        </div>
        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
          {plan.summary}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{plan.totalHours} total hours</span>
          <span>•</span>
          <span>{plan.weeksTotal} total weeks</span>
        </div>
      </header>

      {/* Warnings Card (Heads up) */}
      {hasWarnings && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-800 dark:text-amber-200">
              Heads up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Vertical Timeline of Modules */}
      <div className="relative border-l-2 border-border ml-4 pl-6 space-y-6">
        {sortedModules.map((module) => {
          const course =
            courses instanceof Map
              ? (courses as Map<string, Course>).get(module.courseId)
              : courses?.[module.courseId];
          const startWeek = module.startWeek ?? 1;
          const durationWeeks = module.durationWeeks ?? 1;
          const endWeek = startWeek + durationWeeks - 1;
          const courseUrl = course?.url || "#";
          const courseTitle = course?.title || module.courseId;

          const isHighDemand = module.marketTag === "high_demand";
          const isRising = module.marketTag === "rising";

          return (
            <div key={module.courseId || module.order} className="relative">
              {/* Order number marker on timeline */}
              <div className="absolute -left-[37px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full border bg-background font-semibold text-xs text-foreground ring-4 ring-background shadow-xs">
                {module.order}
              </div>

              <Card>
                <CardHeader className="space-y-2 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Module {module.order}
                      </span>
                      <h3 className="text-base font-semibold leading-snug">
                        <a
                          href={courseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-foreground inline-flex items-center gap-1.5"
                        >
                          {courseTitle}
                          <ExternalLink className="size-3.5 shrink-0 opacity-70" />
                        </a>
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {course?.provider && (
                        <Badge variant="secondary">{course.provider}</Badge>
                      )}
                      {course?.level && (
                        <Badge variant="outline" className="capitalize">
                          {course.level}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{module.hours} hours</span>
                    <span>•</span>
                    <span>
                      Weeks {startWeek} to {endWeek}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {module.rationale}
                  </p>

                  {(isHighDemand ||
                    isRising ||
                    (module.skillsCovered &&
                      module.skillsCovered.length > 0)) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {isHighDemand && (
                        <Badge variant="default">High demand</Badge>
                      )}
                      {isRising && <Badge variant="secondary">Rising</Badge>}
                      {module.skillsCovered?.map((skill) => (
                        <Badge
                          key={skill}
                          variant="outline"
                          className="text-xs font-normal text-muted-foreground"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PlanRoadmap;
