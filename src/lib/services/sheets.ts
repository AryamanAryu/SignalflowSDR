import { prisma } from "@/lib/db";
import { normalizeDomain } from "@/lib/dedupe";
import { csvCompanyRowSchema } from "@/lib/validators/company";
import {
  parseSheetId,
  parseServiceAccountEmail,
  testConnection,
  readSheetRows,
} from "@/lib/google-sheets";

export const SHEET_TARGET_FIELDS = [
  { key: "name", label: "Company Name", required: true },
  { key: "domain", label: "Domain", required: true },
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "employeeCount", label: "Employee Count" },
  { key: "status", label: "Status" },
] as const;

function statusFromLabel(v: unknown): string | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s === "new") return "NEW";
  if (s === "reached out" || s === "reached_out" || s === "reachedout") return "REACHED_OUT";
  if (s === "customer") return "CUSTOMER";
  return undefined;
}

// Returns the connection without the sensitive credentials blob.
export async function getSheetConnectionSafe() {
  const c = await prisma.sheetConnection.findFirst();
  if (!c) return null;
  const { credentialsJson, ...rest } = c;
  return { ...rest, hasCredentials: Boolean(credentialsJson) };
}

export async function getSheetHistory(connectionId: string, limit = 5) {
  return prisma.syncHistory.findMany({
    where: { connectionId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

// Create or update the single sheet connection (URL + uploaded credentials).
export async function saveConnection(input: {
  sheetUrl: string;
  credentialsJson?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sheetId = parseSheetId(input.sheetUrl);
  if (!sheetId) return { ok: false, error: "Could not read a Sheet ID from that URL." };

  let serviceAccountEmail: string | undefined;
  if (input.credentialsJson) {
    const email = parseServiceAccountEmail(input.credentialsJson);
    if (!email) return { ok: false, error: "That doesn't look like a valid service-account JSON." };
    serviceAccountEmail = email;
  }

  const existing = await prisma.sheetConnection.findFirst();
  if (existing) {
    await prisma.sheetConnection.update({
      where: { id: existing.id },
      data: {
        sheetUrl: input.sheetUrl,
        sheetId,
        ...(input.credentialsJson
          ? { credentialsJson: input.credentialsJson, serviceAccountEmail }
          : {}),
      },
    });
  } else {
    if (!input.credentialsJson) {
      return { ok: false, error: "Upload the service-account JSON to create the connection." };
    }
    await prisma.sheetConnection.create({
      data: {
        sheetUrl: input.sheetUrl,
        sheetId,
        credentialsJson: input.credentialsJson,
        serviceAccountEmail,
      },
    });
  }
  return { ok: true };
}

export async function testSavedConnection() {
  const conn = await prisma.sheetConnection.findFirst();
  if (!conn) return { ok: false as const, error: "No connection yet." };
  if (!conn.credentialsJson) return { ok: false as const, error: "Upload credentials first." };
  return testConnection(conn.credentialsJson, conn.sheetId);
}

// Save the chosen tab and read its header row for the mapping UI.
export async function loadColumns(sheetName: string) {
  const conn = await prisma.sheetConnection.findFirst();
  if (!conn?.credentialsJson) return { ok: false as const, error: "Connect a sheet first." };

  await prisma.sheetConnection.update({
    where: { id: conn.id },
    data: { sheetName },
  });

  const read = await readSheetRows(conn.credentialsJson, conn.sheetId, sheetName);
  if (!read.ok) return { ok: false as const, error: read.error };
  return { ok: true as const, headers: read.headers };
}

export async function saveMapping(columnMapping: Record<string, string>) {
  const conn = await prisma.sheetConnection.findFirst();
  if (!conn) return { ok: false, error: "No connection." };
  await prisma.sheetConnection.update({
    where: { id: conn.id },
    data: { columnMapping },
  });
  return { ok: true };
}

export async function setAutoSync(enabled: boolean) {
  const conn = await prisma.sheetConnection.findFirst();
  if (!conn) return { ok: false, error: "No connection." };
  await prisma.sheetConnection.update({
    where: { id: conn.id },
    data: { autoDailySync: enabled },
  });
  return { ok: true };
}

export type SyncResult = {
  ok: boolean;
  rowsImported: number;
  rowsUpdated: number;
  rowsFailed: number;
  error?: string;
};

// The sync engine. Imports new companies, updates existing ones BY DOMAIN,
// skips in-sheet duplicates, and preserves CRM / ICP / Intent data by only
// writing the sheet-sourced columns.
export async function runSync(connectionId?: string): Promise<SyncResult> {
  const conn = connectionId
    ? await prisma.sheetConnection.findUnique({ where: { id: connectionId } })
    : await prisma.sheetConnection.findFirst();

  if (!conn) return { ok: false, rowsImported: 0, rowsUpdated: 0, rowsFailed: 0, error: "No connection." };
  if (!conn.credentialsJson)
    return { ok: false, rowsImported: 0, rowsUpdated: 0, rowsFailed: 0, error: "Upload credentials first." };
  if (!conn.columnMapping)
    return { ok: false, rowsImported: 0, rowsUpdated: 0, rowsFailed: 0, error: "Configure column mapping first." };

  const history = await prisma.syncHistory.create({
    data: { connectionId: conn.id, status: "RUNNING" },
  });

  try {
    const mapping = conn.columnMapping as Record<string, string>;
    let range = conn.sheetName ?? "";
    if (!range) {
      const meta = await testConnection(conn.credentialsJson, conn.sheetId);
      if (!meta.ok) throw new Error(meta.error);
      range = meta.tabs[0] ?? "Sheet1";
    }

    const read = await readSheetRows(conn.credentialsJson, conn.sheetId, range);
    if (!read.ok) throw new Error(read.error);

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < read.rows.length; i++) {
      const rec = read.rows[i];
      const rowNum = i + 2; // +1 header, +1 to 1-index

      // Map sheet columns -> company fields.
      const input: Record<string, unknown> = {};
      for (const field of SHEET_TARGET_FIELDS) {
        const header = mapping[field.key];
        if (header && rec[header] !== undefined) {
          input[field.key] =
            field.key === "status" ? statusFromLabel(rec[header]) : rec[header];
        }
      }

      const parsed = csvCompanyRowSchema.safeParse(input);
      if (!parsed.success) {
        failed++;
        errors.push({ row: rowNum, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      const data = parsed.data;
      const normalizedDomain = normalizeDomain(data.domain);
      if (!normalizedDomain) {
        failed++;
        errors.push({ row: rowNum, message: "Missing domain (required to sync by domain)" });
        continue;
      }
      if (seen.has(normalizedDomain)) continue; // duplicate within sheet -> skip
      seen.add(normalizedDomain);

      const existing = await prisma.company.findUnique({ where: { normalizedDomain } });

      if (existing) {
        // Update ONLY sheet-sourced fields; CRM / ICP / Intent are untouched.
        await prisma.company.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            domain: data.domain,
            linkedinUrl: data.linkedinUrl ?? existing.linkedinUrl,
            country: data.country ?? existing.country,
            industry: data.industry ?? existing.industry,
            employeeCount: data.employeeCount ?? existing.employeeCount,
            ...(data.status ? { status: data.status } : {}),
            lastSyncedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.company.create({
          data: {
            name: data.name,
            domain: data.domain,
            normalizedDomain,
            linkedinUrl: data.linkedinUrl,
            country: data.country,
            industry: data.industry,
            employeeCount: data.employeeCount,
            status: data.status ?? "NEW",
            source: "SHEET",
            lastSyncedAt: new Date(),
          },
        });
        imported++;
      }
    }

    await prisma.$transaction([
      prisma.syncHistory.update({
        where: { id: history.id },
        data: {
          status: "SUCCESS",
          rowsImported: imported,
          rowsUpdated: updated,
          rowsFailed: failed,
          errors: errors.length ? errors : undefined,
          finishedAt: new Date(),
        },
      }),
      prisma.sheetConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncAt: new Date(),
          lastImported: imported,
          lastUpdated: updated,
          lastFailed: failed,
        },
      }),
    ]);

    return { ok: true, rowsImported: imported, rowsUpdated: updated, rowsFailed: failed };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await prisma.syncHistory.update({
      where: { id: history.id },
      data: { status: "FAILED", errors: [{ row: 0, message }], finishedAt: new Date() },
    });
    return { ok: false, rowsImported: 0, rowsUpdated: 0, rowsFailed: 0, error: message };
  }
}

// Used by the daily cron: sync every connection with auto-sync enabled.
export async function runAutoSyncs() {
  const conns = await prisma.sheetConnection.findMany({
    where: { autoDailySync: true },
    select: { id: true },
  });
  const results = [];
  for (const c of conns) results.push(await runSync(c.id));
  return { connections: conns.length, results };
}
