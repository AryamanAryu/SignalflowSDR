import { prisma } from "@/lib/db";
import { COLLECTORS } from "@/lib/signals/registry";
import { intentLevelFromScore } from "@/lib/intent-meta";

// Small deterministic string hash (djb2) — used to fingerprint a snapshot.
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export type ScanResult = {
  ok: boolean;
  created: number;
  changed: boolean;
  error?: string;
};

// Scan a single company: run all collectors, diff vs the last snapshot,
// create signals only when something changed, then recompute intent.
export async function scanCompany(companyId: string): Promise<ScanResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { ok: false, created: 0, changed: false, error: "Company not found." };

  const previousSnapshot = await prisma.companySnapshot.findFirst({
    where: { companyId },
    orderBy: { capturedAt: "desc" },
  });

  const ctx = { company, previousSnapshot };

  // Run collectors; a failing collector contributes nothing (never aborts).
  const detectedNested = await Promise.all(
    COLLECTORS.map((c) => c.collect(ctx).catch(() => []))
  );
  const detected = detectedNested.flat();

  // Fingerprint the monitored surface.
  const keys = detected.map((d) => d.dedupeKey).sort();
  const fingerprint = hash(
    JSON.stringify({ employeeCount: company.employeeCount ?? null, keys })
  );
  const changed = !previousSnapshot || previousSnapshot.hash !== fingerprint;

  let created = 0;
  if (changed) {
    const existing = await prisma.signal.findMany({
      where: { companyId, resolved: false },
      select: { signalType: true, title: true },
    });
    const existingSet = new Set(existing.map((e) => `${e.signalType}:${e.title}`));

    for (const d of detected) {
      const key = `${d.signalType}:${d.title}`;
      if (existingSet.has(key)) continue;
      existingSet.add(key);
      await prisma.signal.create({
        data: {
          companyId,
          signalType: d.signalType,
          title: d.title,
          description: d.description,
          source: d.source,
          sourceUrl: d.sourceUrl,
          signalScore: d.score,
        },
      });
      created++;
    }
  }

  // Always store a snapshot (history) and stamp the scan time.
  await prisma.companySnapshot.create({
    data: {
      companyId,
      employeeCount: company.employeeCount,
      hash: fingerprint,
      payload: { keys },
    },
  });
  await prisma.company.update({
    where: { id: companyId },
    data: { lastScannedAt: new Date() },
  });

  await recomputeIntent(companyId);
  return { ok: true, created, changed };
}

// Recompute a company's intent score (sum of open signal scores) + level.
export async function recomputeIntent(companyId: string) {
  const agg = await prisma.signal.aggregate({
    where: { companyId, resolved: false },
    _sum: { signalScore: true },
  });
  const score = agg._sum.signalScore ?? 0;
  const level = intentLevelFromScore(score);
  await prisma.company.update({
    where: { id: companyId },
    data: { intentScore: score, intentLevel: level },
  });
  return { score, level };
}

// Scan many companies (oldest-scanned first). Used by the daily cron.
export async function scanAll(limit = 100) {
  const companies = await prisma.company.findMany({
    orderBy: { lastScannedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  let signalsCreated = 0;
  const errors: string[] = [];

  for (const c of companies) {
    const res = await scanCompany(c.id);
    processed++;
    signalsCreated += res.created;
    if (res.error) errors.push(res.error);
  }

  return { processed, signalsCreated, errors };
}

// ----- Reads -----
export async function getCompanySignals(companyId: string) {
  return prisma.signal.findMany({
    where: { companyId },
    orderBy: [{ resolved: "asc" }, { detectedAt: "desc" }],
  });
}

export async function getIntentDashboard(limit = 200) {
  return prisma.company.findMany({
    where: { intentScore: { gt: 0 } },
    orderBy: { intentScore: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      intentScore: true,
      intentLevel: true,
      pipelineStage: true,
      lastOutreachAt: true,
      signals: {
        where: { resolved: false },
        select: { signalType: true },
      },
    },
  });
}

export async function countHighIntent() {
  return prisma.company.count({
    where: { intentLevel: { in: ["HIGH", "URGENT"] } },
  });
}

export async function resolveSignal(id: string) {
  const signal = await prisma.signal.update({
    where: { id },
    data: { resolved: true },
  });
  await recomputeIntent(signal.companyId);
  return signal;
}
