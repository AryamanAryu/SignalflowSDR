import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

// Extract the spreadsheet ID from a full URL (or accept a raw ID).
export function parseSheetId(input: string): string | null {
  const url = input.trim();
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;
  return null;
}

export function parseServiceAccountEmail(credentialsJson: string): string | null {
  try {
    const c = JSON.parse(credentialsJson) as { client_email?: string };
    return typeof c.client_email === "string" ? c.client_email : null;
  } catch {
    return null;
  }
}

function buildClient(credentialsJson: string): JWT {
  const creds = JSON.parse(credentialsJson) as {
    client_email: string;
    private_key: string;
  };
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
}

function friendlyError(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  const status = err?.response?.status;
  if (status === 403)
    return "Access denied (403). Share the sheet with the service-account email as a Viewer.";
  if (status === 404) return "Spreadsheet not found (404). Check the Sheet URL.";
  if (status === 401) return "Authentication failed (401). Check the service-account JSON.";
  return err?.response?.data?.error?.message ?? err?.message ?? "Could not reach Google Sheets.";
}

export type TestResult =
  | { ok: true; title?: string; tabs: string[]; serviceAccountEmail: string }
  | { ok: false; error: string };

export async function testConnection(
  credentialsJson: string,
  sheetId: string
): Promise<TestResult> {
  try {
    const client = buildClient(credentialsJson);
    const res = await client.request<{
      properties?: { title?: string };
      sheets?: { properties?: { title?: string } }[];
    }>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`,
    });
    const tabs = (res.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t));
    return {
      ok: true,
      title: res.data.properties?.title,
      tabs,
      serviceAccountEmail: parseServiceAccountEmail(credentialsJson) ?? "",
    };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export type ReadResult =
  | { ok: true; headers: string[]; rows: Record<string, string>[] }
  | { ok: false; error: string };

export async function readSheetRows(
  credentialsJson: string,
  sheetId: string,
  range: string
): Promise<ReadResult> {
  try {
    const client = buildClient(credentialsJson);
    const res = await client.request<{ values?: string[][] }>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    });
    const values = res.data.values ?? [];
    if (values.length === 0) return { ok: true, headers: [], rows: [] };

    const headers = values[0].map((h) => String(h).trim());
    const rows = values.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] != null ? String(r[i]) : "";
      });
      return obj;
    });
    return { ok: true, headers, rows };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}
