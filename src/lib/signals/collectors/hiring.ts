import type { Company } from "@prisma/client";
import type { DetectedSignal, SignalCollector } from "../types";

const TIMEOUT_MS = 12_000;
const MAX_SIGNALS = 20;

// Target departments and their score contribution.
// Finance-family hiring is the highest-priority intent signal (+30).
const DEPT_RULES: { dept: string; score: number; keywords: string[] }[] = [
  { dept: "Finance", score: 30, keywords: ["finance", "financial", "fp&a", "fpa", "controller", "cfo"] },
  { dept: "Accounting", score: 30, keywords: ["accounting", "accountant", "bookkeep"] },
  { dept: "Treasury", score: 30, keywords: ["treasury", "treasurer"] },
  { dept: "Revenue Operations", score: 25, keywords: ["revenue operations", "revops", "rev ops", "revenue ops"] },
  { dept: "Operations", score: 20, keywords: ["operations", "business operations", "ops manager"] },
  { dept: "Global Expansion", score: 20, keywords: ["international", "global expansion", "country manager", "expansion", "gtm expansion"] },
];

function classify(title: string): { dept: string; score: number } | null {
  const t = title.toLowerCase();
  for (const rule of DEPT_RULES) {
    if (rule.keywords.some((k) => t.includes(k))) {
      return { dept: rule.dept, score: rule.score };
    }
  }
  return null;
}

function slugCandidates(company: Company): string[] {
  const out = new Set<string>();
  const domainBase = (company.normalizedDomain ?? company.domain ?? "")
    .split(".")[0]
    ?.trim();
  if (domainBase) out.add(domainBase.toLowerCase());
  const name = company.name.toLowerCase().trim();
  out.add(name.replace(/[^a-z0-9]+/g, ""));
  out.add(name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  return [...out].filter(Boolean).slice(0, 3);
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Job = { title: string; url?: string };

// Lever public postings API.
async function fetchLever(slug: string): Promise<Job[] | null> {
  const json = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!Array.isArray(json) || json.length === 0) return null;
  return json
    .map((p): Job | null => {
      const r = p as Record<string, unknown>;
      const title = typeof r.text === "string" ? r.text : "";
      const url = typeof r.hostedUrl === "string" ? r.hostedUrl : undefined;
      return title ? { title, url } : null;
    })
    .filter((j): j is Job => j !== null);
}

// Greenhouse public job board API.
async function fetchGreenhouse(slug: string): Promise<Job[] | null> {
  const json = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  const jobs = (json as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  return jobs
    .map((p): Job | null => {
      const r = p as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title : "";
      const url = typeof r.absolute_url === "string" ? r.absolute_url : undefined;
      return title ? { title, url } : null;
    })
    .filter((j): j is Job => j !== null);
}

export const hiringCollector: SignalCollector = {
  key: "hiring",
  label: "Hiring (Greenhouse / Lever job boards)",
  live: true,
  async collect({ company }) {
    let jobs: Job[] | null = null;
    let board: string | null = null;

    for (const slug of slugCandidates(company)) {
      jobs = await fetchLever(slug);
      if (jobs?.length) {
        board = "Lever";
        break;
      }
      jobs = await fetchGreenhouse(slug);
      if (jobs?.length) {
        board = "Greenhouse";
        break;
      }
    }
    if (!jobs || !board) return [];

    const signals: DetectedSignal[] = [];
    const seen = new Set<string>();

    for (const job of jobs) {
      const match = classify(job.title);
      if (!match) continue;
      const key = `hiring:${job.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      signals.push({
        signalType: "HIRING",
        title: job.title,
        description: `${match.dept} role open at ${company.name} — a buying-intent signal for our solution.`,
        source: `Careers (${board})`,
        sourceUrl: job.url,
        score: match.score,
        dedupeKey: key,
      });
      if (signals.length >= MAX_SIGNALS) break;
    }
    return signals;
  },
};
