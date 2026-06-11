"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  createCompanySchema,
  updateCompanySchema,
  bulkStatusSchema,
  bulkDeleteSchema,
  bulkIcpStatusSchema,
  assignOwnerSchema,
  pushToCrmSchema,
  listCompaniesQuerySchema,
} from "@/lib/validators/company";
import {
  createCompany,
  updateCompany,
  bulkUpdateStatus,
  deleteCompanies,
  importCompanies,
  setIcpStatus,
  assignOwner,
  pushToCrm,
  exportCompaniesCsv,
  getMatchingCompanyIds,
  DuplicateCompanyError,
  type ImportResult,
  type PushToCrmResult,
} from "@/lib/services/companies";
import {
  enrichCompany,
  enrichMany,
  type EnrichSummary,
} from "@/lib/services/enrichment";
import { scanCompany } from "@/lib/services/signals";
import { qualifyCompany, qualifyMany } from "@/lib/services/icp";
import type { IcpResult } from "@/lib/icp";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAuth(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export async function createCompanyAction(
  input: unknown
): Promise<ActionResult> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createCompany(parsed.data);
    revalidatePath("/companies");
    return { ok: true };
  } catch (err) {
    if (err instanceof DuplicateCompanyError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong creating the company." };
  }
}

export async function updateCompanyAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const parsed = updateCompanySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateCompany(id, parsed.data);
    revalidatePath("/companies");
    revalidatePath(`/companies/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof DuplicateCompanyError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong updating the company." };
  }
}

export async function bulkUpdateStatusAction(
  input: unknown
): Promise<ActionResult<{ count: number }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const parsed = bulkStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const count = await bulkUpdateStatus(parsed.data.ids, parsed.data.status);
  revalidatePath("/companies");
  return { ok: true, data: { count } };
}

export async function deleteCompaniesAction(
  input: unknown
): Promise<ActionResult<{ count: number }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const parsed = bulkDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const count = await deleteCompanies(parsed.data.ids);
  revalidatePath("/companies");
  return { ok: true, data: { count } };
}

export async function importCompaniesAction(
  rows: Record<string, unknown>[]
): Promise<ActionResult<ImportResult>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }
  if (rows.length > 10_000) {
    return { ok: false, error: "Too many rows (max 10,000 per import)." };
  }

  const result = await importCompanies(rows);
  revalidatePath("/companies");
  return { ok: true, data: result };
}

export async function enrichCompanyAction(
  companyId: string
): Promise<ActionResult<EnrichSummary>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const summary = await enrichCompany(companyId);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/contacts");
  revalidatePath("/re-engagement");
  if (!summary.ok && summary.error) return { ok: false, error: summary.error };
  return { ok: true, data: summary };
}

export async function enrichManyAction(
  ids: string[]
): Promise<ActionResult<Awaited<ReturnType<typeof enrichMany>>>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Select at least one company." };
  }

  const result = await enrichMany(ids);
  revalidatePath("/companies");
  revalidatePath("/contacts");
  revalidatePath("/re-engagement");
  return { ok: true, data: result };
}

export async function scanCompanyAction(
  companyId: string
): Promise<ActionResult<{ created: number; changed: boolean }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const res = await scanCompany(companyId);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/re-engagement");
  revalidatePath("/dashboard");
  if (!res.ok) return { ok: false, error: res.error ?? "Scan failed." };
  return { ok: true, data: { created: res.created, changed: res.changed } };
}

export async function scanManyAction(
  ids: string[]
): Promise<ActionResult<{ processed: number; signalsCreated: number }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Select at least one company." };
  }

  // Reuse scanAll's per-company logic by scanning the selected ids.
  let processed = 0;
  let signalsCreated = 0;
  for (const id of ids.slice(0, 50)) {
    const res = await scanCompany(id);
    processed++;
    signalsCreated += res.created;
  }
  revalidatePath("/companies");
  revalidatePath("/re-engagement");
  revalidatePath("/dashboard");
  return { ok: true, data: { processed, signalsCreated } };
}

export async function qualifyCompanyAction(
  companyId: string
): Promise<ActionResult<IcpResult>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };

  const result = await qualifyCompany(companyId);
  if (!result) return { ok: false, error: "Company not found." };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  return { ok: true, data: result };
}

export async function qualifyManyAction(
  ids: string[]
): Promise<ActionResult<Awaited<ReturnType<typeof qualifyMany>>>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Select at least one company." };
  }
  const result = await qualifyMany(ids);
  revalidatePath("/companies");
  return { ok: true, data: result };
}

// ───── Qualification workflow / bulk actions ─────
export async function setIcpStatusAction(
  input: unknown
): Promise<ActionResult<{ count: number }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  const parsed = bulkIcpStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const count = await setIcpStatus(parsed.data.ids, parsed.data.status);
  revalidatePath("/companies");
  revalidatePath("/re-engagement");
  return { ok: true, data: { count } };
}

export async function assignOwnerAction(
  input: unknown
): Promise<ActionResult<{ count: number }>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  const parsed = assignOwnerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const count = await assignOwner(parsed.data.ids, parsed.data.ownerId);
  revalidatePath("/companies");
  return { ok: true, data: { count } };
}

export async function pushToCrmAction(
  input: unknown
): Promise<ActionResult<PushToCrmResult>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  const parsed = pushToCrmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await pushToCrm(parsed.data.ids);
  revalidatePath("/companies");
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  return { ok: true, data: result };
}

export async function exportCompaniesAction(
  ids: string[]
): Promise<ActionResult<string>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Select at least one company." };
  }
  const csv = await exportCompaniesCsv(ids);
  return { ok: true, data: csv };
}

export async function getMatchingIdsAction(
  rawQuery: Record<string, unknown>
): Promise<ActionResult<string[]>> {
  if (!(await requireAuth())) return { ok: false, error: "Not signed in" };
  const parsed = listCompaniesQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return { ok: false, error: "Invalid filters" };
  const ids = await getMatchingCompanyIds(parsed.data);
  return { ok: true, data: ids };
}
