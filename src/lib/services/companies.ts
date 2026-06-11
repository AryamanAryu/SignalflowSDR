import {
  Prisma,
  type CompanyStatus,
  type CompanySource,
  type IcpStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDomain } from "@/lib/dedupe";
import {
  csvCompanyRowSchema,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type ListCompaniesQuery,
} from "@/lib/validators/company";

/** Thrown when a company with the same domain already exists. */
export class DuplicateCompanyError extends Error {
  constructor(domain: string) {
    super(`A company with the domain "${domain}" already exists.`);
    this.name = "DuplicateCompanyError";
  }
}

// Country groups for the Region / HQ filters.
const REGION_COUNTRIES: Record<string, string[]> = {
  INDIA: ["india"],
  US: ["united states", "usa", "u.s."],
  SEA: ["singapore", "indonesia", "malaysia", "thailand", "vietnam", "philippines"],
};

// Builds a composable WHERE from all filters (each condition AND-ed together).
export function buildCompanyWhere(q: ListCompaniesQuery): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = [];

  if (q.search)
    and.push({
      OR: [
        { name: { contains: q.search, mode: "insensitive" } },
        { domain: { contains: q.search, mode: "insensitive" } },
      ],
    });
  if (q.status) and.push({ status: q.status });
  if (q.country) and.push({ country: { contains: q.country, mode: "insensitive" } });
  if (q.industry) and.push({ industry: { contains: q.industry, mode: "insensitive" } });
  if (q.companyType) and.push({ icpCategory: { contains: q.companyType, mode: "insensitive" } });
  if (q.region)
    and.push({
      OR: REGION_COUNTRIES[q.region].map((c) => ({
        country: { contains: c, mode: "insensitive" as const },
      })),
    });
  if (q.empMin != null) and.push({ employeeCount: { gte: q.empMin } });
  if (q.empMax != null) and.push({ employeeCount: { lte: q.empMax } });
  if (q.billing) and.push({ icpSignals: { has: q.billing } });
  if (q.icpStatus) and.push({ icpStatus: q.icpStatus });
  if (q.icpMin != null) and.push({ icpScore: { gte: q.icpMin } });
  if (q.icpMax != null) and.push({ icpScore: { lte: q.icpMax } });
  if (q.intentMin != null) and.push({ intentScore: { gte: q.intentMin } });
  if (q.intentMax != null) and.push({ intentScore: { lte: q.intentMax } });
  if (q.priority) and.push({ priority: q.priority });
  if (q.signal) and.push({ signals: { some: { signalType: q.signal, resolved: false } } });
  if (q.crm) and.push({ inCrm: q.crm === "IN" });
  if (q.assigned)
    and.push({ sdrOwnerId: q.assigned === "ASSIGNED" ? { not: null } : null });

  return and.length ? { AND: and } : {};
}

// ----- List (search / filter / sort / paginate) -----
export async function listCompanies(q: ListCompaniesQuery) {
  const where = buildCompanyWhere(q);

  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { [q.sort]: q.order },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { owner: { select: { id: true, name: true, email: true } } },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

// All company ids matching the current filters (for "select all matching").
export async function getMatchingCompanyIds(q: ListCompaniesQuery, cap = 5000) {
  const rows = await prisma.company.findMany({
    where: buildCompanyWhere(q),
    select: { id: true },
    take: cap,
  });
  return rows.map((r) => r.id);
}

export async function getCompany(id: string) {
  return prisma.company.findUnique({ where: { id } });
}

// ----- Create one -----
export async function createCompany(
  input: CreateCompanyInput,
  source: CompanySource = "MANUAL"
) {
  const normalizedDomain = normalizeDomain(input.domain);

  if (normalizedDomain) {
    const existing = await prisma.company.findUnique({
      where: { normalizedDomain },
    });
    if (existing) throw new DuplicateCompanyError(normalizedDomain);
  }

  return prisma.company.create({
    data: {
      name: input.name,
      domain: input.domain,
      normalizedDomain,
      linkedinUrl: input.linkedinUrl,
      country: input.country,
      industry: input.industry,
      employeeCount: input.employeeCount,
      status: input.status ?? "NEW",
      source,
    },
  });
}

// ----- Update one -----
export async function updateCompany(id: string, input: UpdateCompanyInput) {
  const data: Prisma.CompanyUpdateInput = { ...input };

  // If the domain changed, re-derive the dedupe key and guard against clashes.
  if (input.domain !== undefined) {
    const normalizedDomain = normalizeDomain(input.domain);
    if (normalizedDomain) {
      const clash = await prisma.company.findUnique({
        where: { normalizedDomain },
      });
      if (clash && clash.id !== id) throw new DuplicateCompanyError(normalizedDomain);
    }
    data.normalizedDomain = normalizedDomain;
  }

  return prisma.company.update({ where: { id }, data });
}

// ----- Bulk operations -----
export async function bulkUpdateStatus(ids: string[], status: CompanyStatus) {
  const result = await prisma.company.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
  return result.count;
}

export async function deleteCompanies(ids: string[]) {
  const result = await prisma.company.deleteMany({
    where: { id: { in: ids } },
  });
  return result.count;
}

// ----- CSV import -----
export type ImportResult = {
  received: number;
  inserted: number;
  skippedDuplicate: number;
  invalid: { row: number; message: string }[];
};

/**
 * Imports an array of raw CSV rows. Validates each row, drops duplicates
 * within the file AND against the existing database (by normalized domain),
 * then bulk-inserts the survivors.
 */
export async function importCompanies(
  rawRows: Record<string, unknown>[]
): Promise<ImportResult> {
  const invalid: { row: number; message: string }[] = [];
  const seenInFile = new Set<string>();
  const candidates: Prisma.CompanyCreateManyInput[] = [];
  let skippedDuplicate = 0;

  rawRows.forEach((raw, i) => {
    const parsed = csvCompanyRowSchema.safeParse(raw);
    if (!parsed.success) {
      invalid.push({
        row: i + 1,
        message: parsed.error.issues[0]?.message ?? "Invalid row",
      });
      return;
    }

    const data = parsed.data;
    const normalizedDomain = normalizeDomain(data.domain);

    if (normalizedDomain) {
      if (seenInFile.has(normalizedDomain)) {
        skippedDuplicate++;
        return;
      }
      seenInFile.add(normalizedDomain);
    }

    candidates.push({
      name: data.name,
      domain: data.domain,
      normalizedDomain,
      linkedinUrl: data.linkedinUrl,
      country: data.country,
      industry: data.industry,
      employeeCount: data.employeeCount,
      status: data.status ?? "NEW",
      source: "CSV",
    });
  });

  // Drop rows whose domain already exists in the database.
  const domains = candidates
    .map((c) => c.normalizedDomain)
    .filter((d): d is string => Boolean(d));

  if (domains.length > 0) {
    const existing = await prisma.company.findMany({
      where: { normalizedDomain: { in: domains } },
      select: { normalizedDomain: true },
    });
    const existingSet = new Set(existing.map((e) => e.normalizedDomain));
    for (let i = candidates.length - 1; i >= 0; i--) {
      const d = candidates[i].normalizedDomain;
      if (d && existingSet.has(d)) {
        candidates.splice(i, 1);
        skippedDuplicate++;
      }
    }
  }

  const result = await prisma.company.createMany({
    data: candidates,
    skipDuplicates: true,
  });

  return {
    received: rawRows.length,
    inserted: result.count,
    skippedDuplicate,
    invalid,
  };
}

// ───── Qualification workflow ─────────────────────────────────
// The qualification status reuses icpStatus:
//   Qualified = QUALIFIED, Not Qualified = DISQUALIFIED, Needs Review = REVIEW
export async function setIcpStatus(ids: string[], status: IcpStatus) {
  const result = await prisma.company.updateMany({
    where: { id: { in: ids } },
    data: { icpStatus: status },
  });
  return result.count;
}

export async function assignOwner(ids: string[], ownerId: string | null) {
  const result = await prisma.company.updateMany({
    where: { id: { in: ids } },
    data: { sdrOwnerId: ownerId },
  });
  return result.count;
}

// ───── Push To CRM ────────────────────────────────────────────
export type PushToCrmResult = {
  pushed: number;
  skippedNotQualified: number;
  skippedAlready: number;
};

export async function pushToCrm(ids: string[]): Promise<PushToCrmResult> {
  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, icpStatus: true, inCrm: true, normalizedDomain: true },
  });

  const eligible: string[] = [];
  const seenDomains = new Set<string>();
  let skippedNotQualified = 0;
  let skippedAlready = 0;

  for (const c of companies) {
    if (c.icpStatus !== "QUALIFIED") {
      skippedNotQualified++;
      continue;
    }
    if (c.inCrm) {
      skippedAlready++;
      continue;
    }
    // Duplicate prevention by domain (within this batch).
    if (c.normalizedDomain) {
      if (seenDomains.has(c.normalizedDomain)) {
        skippedAlready++;
        continue;
      }
      seenDomains.add(c.normalizedDomain);
    }
    eligible.push(c.id);
  }

  if (eligible.length > 0) {
    // Enter the pipeline at the first stage ("New"), flag as In CRM.
    // All existing intelligence stays on the same record (nothing to copy).
    await prisma.company.updateMany({
      where: { id: { in: eligible } },
      data: { inCrm: true, pipelineStage: "NOT_REACHED_OUT" },
    });
  }

  return { pushed: eligible.length, skippedNotQualified, skippedAlready };
}

// ───── Export selected to CSV ─────────────────────────────────
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportCompaniesCsv(ids: string[]): Promise<string> {
  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    include: { owner: { select: { name: true, email: true } } },
  });

  const headers = [
    "Name", "Domain", "Country", "Industry", "Employee Count",
    "Status", "ICP Status", "ICP Score", "ICP Category", "Intent Score",
    "Intent Level", "Priority", "Pipeline Stage", "In CRM", "Owner",
  ];

  const lines = [headers.map(csvCell).join(",")];
  for (const c of companies) {
    lines.push(
      [
        c.name, c.domain, c.country, c.industry, c.employeeCount,
        c.status, c.icpStatus, c.icpScore, c.icpCategory, c.intentScore,
        c.intentLevel, c.priority, c.pipelineStage, c.inCrm ? "Yes" : "No",
        c.owner?.name ?? c.owner?.email ?? "",
      ].map(csvCell).join(",")
    );
  }
  return lines.join("\n");
}
