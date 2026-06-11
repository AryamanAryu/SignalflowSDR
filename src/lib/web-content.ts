// Free, no-Apollo enrichment: fetch a company's public website text so the ICP
// engine has something to classify (pricing/billing/category keywords) without
// spending any Apollo credits.

const TIMEOUT_MS = 7000;
const MAX_CHARS = 15000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalFlowBot/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    const text = stripHtml(html).slice(0, MAX_CHARS);
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Reads the homepage + /pricing (where billing signals usually live).
// Falls back to the www. host if the bare domain doesn't respond.
export async function fetchSiteText(domain: string): Promise<string | null> {
  for (const base of [`https://${domain}`, `https://www.${domain}`]) {
    const [home, pricing] = await Promise.all([
      fetchText(base),
      fetchText(`${base}/pricing`),
    ]);
    const combined = [home, pricing].filter(Boolean).join(" ");
    if (combined) return combined;
  }
  return null;
}
