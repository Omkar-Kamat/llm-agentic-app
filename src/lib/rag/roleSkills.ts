import { asc, cosineDistance, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jobPostings } from "@/lib/db/schema";
import { embedQuery } from "@/lib/llm/embed";

export interface RoleSkillRequirement {
  skill: string;
  freq: number;
}

export async function getRoleRequirements(
  targetRole: string
): Promise<{ skill: string; freq: number }[]> {
  const trimmedRole = targetRole?.trim();
  if (!trimmedRole) {
    return [];
  }

  const queryVector = await embedQuery(`${trimmedRole} job requirements`);
  const distance = cosineDistance(jobPostings.embedding, queryVector);

  const rows = await db
    .select({
      id: jobPostings.id,
      skills: jobPostings.skills,
    })
    .from(jobPostings)
    .where(isNotNull(jobPostings.embedding))
    .orderBy(asc(distance))
    .limit(25);

  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.skills || !Array.isArray(row.skills)) {
      continue;
    }

    const uniqueSkills = new Set(
      row.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );

    for (const skill of uniqueSkills) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([skill, count]) => ({
      skill,
      freq: count / 25,
    }))
    .sort((a, b) => b.freq - a.freq || a.skill.localeCompare(b.skill))
    .slice(0, 15);
}
