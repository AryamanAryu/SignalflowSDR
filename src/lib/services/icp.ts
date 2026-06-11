import { prisma } from "@/lib/db";
import { scoreIcp } from "@/lib/icp";
import { normalizeDomain } from "@/lib/dedupe";
import { fetchSiteText } from "@/lib/web-content";

// Qualify a single company. Reads its public website (free, no Apollo) plus any
// existing industry/description, so it works WITHOUT enrichment.
export async function qualifyCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      domain: true,
      normalizedDomain: true,
      industry: true,
      description: true,
    },
  });
  if (!company) return null;

  const domain = company.normalizedDomain ?? normalizeDomain(company.domain);
  const siteText = domain ? await fetchSiteText(domain) : null;

  const result = scoreIcp({
    name: company.name,
    industry: company.industry,
    // Combine Apollo description (if any) with free website text.
    description: [company.description, siteText].filter(Boolean).join(" ") || null,
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
  const slice = ids.slice(0, 100); // bounded: each company fetches its website
  let qualified = 0;
  let review = 0;
  let disqualified = 0;

  // Process in small parallel batches so website fetches don't run serially.
  const CONCURRENCY = 6;
  for (let i = 0; i < slice.length; i += CONCURRENCY) {
    const batch = slice.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((id) => qualifyCompany(id).catch(() => null))
    );
    for (const r of results) {
      if (r?.status === "QUALIFIED") qualified++;
      else if (r?.status === "REVIEW") review++;
      else if (r?.status === "DISQUALIFIED") disqualified++;
    }
  }

  return { processed: slice.length, qualified, review, disqualified };
}

export async function countQualified() {
  return prisma.company.count({ where: { icpStatus: "QUALIFIED" } });
}
