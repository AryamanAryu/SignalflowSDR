import type { IcpStatus } from "@prisma/client";

// ════════════════════════════════════════════════════════════════════
// Dodo Payments ICP definition (single source of truth).
//
// Core qualification question:
//   "Does the company sell a digital product online and accept payments
//    digitally?"
//
// ICP spans BOTH:
//   1. SaaS / AI / Developer Tools
//   2. Consumer Subscription Apps
//      (e.g. Astrotalk, Healthify, CodeYoung, SpeakX)
//
// Qualification is NOT limited to SaaS.
// ════════════════════════════════════════════════════════════════════

// ----- Valid ICP categories (label -> matching keywords) -----
const CATEGORY_RULES: { label: string; keywords: string[] }[] = [
  { label: "AI SaaS", keywords: ["ai saas", "ai-powered", "ai platform", "artificial intelligence", "machine learning", "genai", "llm", "generative ai"] },
  { label: "Developer Tools", keywords: ["developer tool", "devtool", "developer platform", "sdk", "ci/cd", "observability", "developer-first"] },
  { label: "APIs", keywords: ["api platform", " api ", "apis", "api-first", "api product"] },
  { label: "Infrastructure Software", keywords: ["infrastructure", "database", "cloud infrastructure", "devops", "hosting", "platform as a service", "paas"] },
  { label: "Language Learning Apps", keywords: ["language learning", "language app", "learn english", "spoken english", "language tutor", "vocabulary"] },
  { label: "Astrology Apps", keywords: ["astrology", "horoscope", "tarot", "astrologer", "kundli"] },
  { label: "EdTech", keywords: ["edtech", "education technology", "e-learning", "elearning", "online learning", "tutoring", "learning platform", "test prep", "coding for kids"] },
  { label: "HealthTech", keywords: ["healthtech", "health tech", "wellness app", "fitness app", "health app", "telehealth", "nutrition", "calorie"] },
  { label: "Creator Platforms", keywords: ["creator platform", "creator economy", "monetize your", "for creators"] },
  { label: "Digital Communities", keywords: ["community platform", "online community", "membership community", "paid community"] },
  { label: "Digital Courses", keywords: ["online course", "digital course", "course platform", "cohort-based", "sell courses"] },
  { label: "Digital Downloads", keywords: ["digital download", "digital product", "digital goods"] },
  { label: "Templates", keywords: ["template", "templates"] },
  { label: "Plugins", keywords: ["plugin", "plugins", "browser extension"] },
  { label: "Themes", keywords: ["theme store", "themes", "wordpress theme"] },
  { label: "Consumer Subscription Apps", keywords: ["subscription app", "consumer app", "mobile app", "in-app subscription"] },
  { label: "SaaS", keywords: ["saas", "software as a service", "b2b software", "cloud software", "web app", "software platform"] },
];

// ----- Positive signals (label -> keywords, weight) -----
const SIGNAL_RULES: { label: string; keywords: string[]; weight: number }[] = [
  { label: "Subscription billing", keywords: ["subscription", "subscribe", "recurring", "per month", "/mo", "monthly plan"], weight: 12 },
  { label: "Freemium model", keywords: ["freemium", "free plan", "free tier", "free forever"], weight: 12 },
  { label: "Usage-based billing", keywords: ["usage-based", "pay as you go", "pay-as-you-go", "metered"], weight: 12 },
  { label: "Credit-based billing", keywords: ["credit-based", "credits", "buy credits"], weight: 10 },
  { label: "Token-based billing", keywords: ["token-based", "per token", "per-token", "tokens"], weight: 10 },
  { label: "In-app purchases", keywords: ["in-app purchase", "in app purchase", "iap"], weight: 10 },
  { label: "Online checkout", keywords: ["checkout", "buy now", "online payment", "pay online", "purchase online"], weight: 10 },
  { label: "One-time payments", keywords: ["one-time", "one time payment", "lifetime deal", "lifetime access", "buy once", "pay once"], weight: 8 },
  { label: "Merchant of Record", keywords: ["merchant of record", "merchant-of-record", " mor ", "global tax compliance"], weight: 10 },
  { label: "Pricing page", keywords: ["pricing", "plans & pricing", "see pricing"], weight: 8 },
  { label: "Global customers", keywords: ["global", "worldwide", "international customers", "across countries", "users in"], weight: 6 },
];

// ----- Exclusions (label -> keywords) -----
const EXCLUSION_RULES: { label: string; keywords: string[] }[] = [
  { label: "Agency", keywords: ["agency", "agencies", "marketing agency", "design agency", "creative agency", "ad agency"] },
  { label: "Consultancy", keywords: ["consultancy", "consulting", "consultant", "advisory firm"] },
  { label: "Outsourcing", keywords: ["outsourcing", "outsourced", "staffing", "bpo", "managed services provider"] },
  { label: "Physical ecommerce", keywords: ["physical goods", "apparel", "fashion brand", "free shipping", "ships to", "retail store", "grocery"] },
  { label: "Manufacturing", keywords: ["manufacturing", "manufacturer", "factory", "industrial equipment"] },
  { label: "Real estate", keywords: ["real estate", "realty", "property listings", "brokerage"] },
  { label: "Offline business", keywords: ["restaurant", "brick and mortar", "brick-and-mortar", "in-store only"] },
];

const BILLING_SIGNALS = new Set([
  "Subscription billing",
  "Freemium model",
  "Usage-based billing",
  "Credit-based billing",
  "Token-based billing",
  "In-app purchases",
]);

export type IcpResult = {
  score: number; // 0-100
  status: IcpStatus;
  category: string | null;
  reason: string;
  matchedCategories: string[];
  matchedSignals: string[];
  matchedExclusions: string[];
};

function matches(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function scoreIcp(input: {
  name?: string | null;
  industry?: string | null;
  description?: string | null;
}): IcpResult {
  const hasText = Boolean(input.industry?.trim() || input.description?.trim());
  const text = ` ${[input.name, input.industry, input.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()} `;

  const matchedCategories = CATEGORY_RULES.filter((r) => matches(text, r.keywords)).map((r) => r.label);
  const matchedSignals = SIGNAL_RULES.filter((r) => matches(text, r.keywords)).map((r) => r.label);
  const matchedExclusions = EXCLUSION_RULES.filter((r) => matches(text, r.keywords)).map((r) => r.label);

  const category = matchedCategories[0] ?? null;

  // Score components.
  const categoryScore = matchedCategories.length > 0 ? 40 : 0;
  const signalScore = Math.min(
    SIGNAL_RULES.filter((r) => matchedSignals.includes(r.label)).reduce((sum, r) => sum + r.weight, 0),
    40
  );
  const hasBilling = matchedSignals.some((s) => BILLING_SIGNALS.has(s));
  const synergyBonus = category && hasBilling ? 15 : 0;
  let score = Math.min(categoryScore + signalScore + synergyBonus, 100);

  // Decide status.
  let status: IcpStatus;
  let reason: string;

  if (matchedExclusions.length > 0) {
    status = "DISQUALIFIED";
    score = Math.min(score, 15);
    reason = `Excluded: ${matchedExclusions.join(", ")}.`;
  } else if (!hasText) {
    status = "UNKNOWN";
    score = 0;
    reason = "Not enough data — enrich with Apollo first.";
  } else if (score >= 60) {
    status = "QUALIFIED";
    reason = `Matched ${[category, ...matchedSignals].filter(Boolean).join(", ")}.`;
  } else if (score >= 35) {
    status = "REVIEW";
    reason = matchedCategories.length
      ? `Partial fit: ${[category, ...matchedSignals].filter(Boolean).join(", ")}.`
      : `Some signals (${matchedSignals.join(", ")}) but no clear ICP category.`;
  } else {
    status = "DISQUALIFIED";
    reason = matchedSignals.length
      ? `Weak fit: only ${matchedSignals.join(", ")}.`
      : "No ICP categories or signals found.";
  }

  return { score, status, category, reason, matchedCategories, matchedSignals, matchedExclusions };
}

// ----- UI metadata -----
export const ICP_STATUS_LABELS: Record<IcpStatus, string> = {
  UNKNOWN: "Unknown",
  QUALIFIED: "Qualified",
  REVIEW: "Review",
  DISQUALIFIED: "Disqualified",
};

export const ICP_STATUS_STYLES: Record<IcpStatus, string> = {
  UNKNOWN: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  QUALIFIED: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  REVIEW: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  DISQUALIFIED: "bg-red-500/10 text-red-500 ring-red-500/20",
};

export const ICP_STATUS_OPTIONS = (
  Object.keys(ICP_STATUS_LABELS) as IcpStatus[]
).map((value) => ({ value, label: ICP_STATUS_LABELS[value] }));

// All valid ICP category labels (used by the "Company Type" filter).
export const ICP_CATEGORY_LABELS = CATEGORY_RULES.map((r) => r.label);

// Billing-model filter options. `value` must match a SIGNAL_RULES label.
export const BILLING_FILTER_OPTIONS = [
  { value: "Subscription billing", label: "Subscription Billing" },
  { value: "Usage-based billing", label: "Usage-Based Billing" },
  { value: "Credit-based billing", label: "Credit-Based Billing" },
  { value: "One-time payments", label: "One-Time Payments" },
  { value: "Merchant of Record", label: "Merchant of Record" },
] as const;
