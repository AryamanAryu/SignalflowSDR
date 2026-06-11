// Apollo API client.
// Docs: https://docs.apollo.io/reference  — base host: https://api.apollo.io/api/v1
// Auth: "X-Api-Key" header. The key comes from APOLLO_API_KEY (env only).
//
// All calls are defensive: they never throw on a bad response — they return a
// typed result the service layer can branch on. Field availability depends on
// your Apollo plan, so every parsed field is optional.

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const TIMEOUT_MS = 15_000;

export function isConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY?.trim());
}

export type ApolloUsage = {
  minuteLeft?: number;
  hourlyLeft?: number;
  dailyLeft?: number;
  dailyLimit?: number;
};

export type ConnectionResult = {
  ok: boolean;
  status: number;
  message: string;
  usage?: ApolloUsage;
};

export type EnrichedCompany = {
  apolloOrganizationId?: string;
  employeeCount?: number;
  description?: string;
  industry?: string;
  headquarters?: string;
  linkedinUrl?: string;
};

export type ApolloContact = {
  apolloContactId?: string;
  name: string;
  title?: string;
  seniority?: string;
  email?: string;
  linkedinUrl?: string;
};

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readUsage(headers: Headers): ApolloUsage {
  const n = (key: string) => {
    const raw = headers.get(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    minuteLeft: n("x-minute-requests-left") ?? n("x-rate-limit-minute-left"),
    hourlyLeft: n("x-hourly-requests-left"),
    dailyLeft: n("x-24-hour-requests-left") ?? n("x-daily-requests-left"),
    dailyLimit: n("x-rate-limit-24-hour") ?? n("x-rate-limit-daily"),
  };
}

async function apolloFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${APOLLO_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": process.env.APOLLO_API_KEY ?? "",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ----- Connection / key validation -----
export async function checkConnection(): Promise<ConnectionResult> {
  if (!isConfigured()) {
    return { ok: false, status: 0, message: "APOLLO_API_KEY is not set." };
  }
  try {
    // A cheap enrichment call doubles as a key check.
    const res = await apolloFetch("/organizations/enrich?domain=apollo.io", {
      method: "POST",
    });
    const usage = readUsage(res.headers);
    if (res.status === 200) {
      return { ok: true, status: 200, message: "Connected to Apollo.", usage };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: "Invalid API key.", usage };
    }
    if (res.status === 429) {
      return { ok: false, status: 429, message: "Rate limited by Apollo.", usage };
    }
    return { ok: false, status: res.status, message: `Apollo returned ${res.status}.`, usage };
  } catch {
    return { ok: false, status: 0, message: "Could not reach Apollo." };
  }
}

// ----- Company enrichment -----
export async function enrichCompany(
  domain: string
): Promise<{ ok: boolean; data?: EnrichedCompany; usage?: ApolloUsage; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "APOLLO_API_KEY is not set." };
  try {
    const res = await apolloFetch(
      `/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { method: "POST" }
    );
    const usage = readUsage(res.headers);
    if (res.status !== 200) {
      return { ok: false, usage, error: `Apollo returned ${res.status}.` };
    }
    const json = (await res.json()) as { organization?: Record<string, unknown> };
    const org = json.organization;
    if (!org) return { ok: false, usage, error: "No organization data returned." };

    const hq = [str(org.city), str(org.state), str(org.country)]
      .filter(Boolean)
      .join(", ");

    return {
      ok: true,
      usage,
      data: {
        apolloOrganizationId: str(org.id),
        employeeCount: num(org.estimated_num_employees),
        description: str(org.short_description),
        industry: str(org.industry),
        headquarters: hq || str(org.raw_address),
        linkedinUrl: str(org.linkedin_url),
      },
    };
  } catch {
    return { ok: false, error: "Could not reach Apollo." };
  }
}

// ----- Contact discovery -----
export async function searchContacts(
  domain: string,
  perPage = 25
): Promise<{ ok: boolean; data?: ApolloContact[]; usage?: ApolloUsage; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "APOLLO_API_KEY is not set." };
  try {
    const res = await apolloFetch("/mixed_people/search", {
      method: "POST",
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: perPage,
        person_seniorities: [
          "owner",
          "founder",
          "c_suite",
          "partner",
          "vp",
          "head",
          "director",
          "manager",
        ],
      }),
    });
    const usage = readUsage(res.headers);
    if (res.status !== 200) {
      return { ok: false, usage, error: `Apollo returned ${res.status}.` };
    }
    const json = (await res.json()) as {
      people?: Record<string, unknown>[];
      contacts?: Record<string, unknown>[];
    };
    const people = json.people ?? json.contacts ?? [];

    const contacts: ApolloContact[] = people
      .map((p) => {
        const name =
          str(p.name) ??
          [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ");
        if (!name) return null;
        const email = str(p.email);
        return {
          apolloContactId: str(p.id),
          name,
          title: str(p.title),
          seniority: str(p.seniority),
          // Apollo returns a locked placeholder when email isn't unlocked.
          email: email && !email.includes("email_not_unlocked") ? email : undefined,
          linkedinUrl: str(p.linkedin_url),
        } as ApolloContact;
      })
      .filter((c): c is ApolloContact => c !== null);

    return { ok: true, usage, data: contacts };
  } catch {
    return { ok: false, error: "Could not reach Apollo." };
  }
}
