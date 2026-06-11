import { prisma } from "@/lib/db";
import { scoreIcp } from "@/lib/icp";

// Qualify a single company from its current name / industry / description.
export async function qualifyCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, industry: true, description: true },
  });
  if (!company) return null;

  const result = scoreIcp({
    name: company.name,
    industry: company.industry,
    description: company.description,
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      icpScore: result.score,
      icpStatus: result.status,
      icpCategory: result.category,
      icpReason: result.reason,
      icpSignals: result.matchedSignals,
    },
  });

  return result;
}

export async function qualifyMany(ids: string[]) {
  let qualified = 0;
  let review = 0;
  let disqualified = 0;

  for (const id of ids.slice(0, 200)) {
    const r = await qualifyCompany(id);
    if (r?.status === "QUALIFIED") qualified++;
    else if (r?.status === "REVIEW") review++;
    else if (r?.status === "DISQUALIFIED") disqualified++;
  }

  return { processed: Math.min(ids.length, 200), qualified, review, disqualified };
}

export async function countQualified() {
  return prisma.company.count({ where: { icpStatus: "QUALIFIED" } });
}
