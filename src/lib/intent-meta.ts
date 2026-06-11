import type { IntentLevel, PipelineStage, SignalType } from "@prisma/client";

// ----- Signal types -----
export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  FUNDING: "Funding",
  HIRING: "Hiring",
  HEADCOUNT_GROWTH: "Headcount Growth",
  PRODUCT_LAUNCH: "Product Launch",
  EXPANSION: "Expansion",
  LEADERSHIP_CHANGE: "Leadership Change",
  PARTNERSHIP: "Partnership",
};

export function signalTypeLabel(t: SignalType): string {
  return SIGNAL_TYPE_LABELS[t] ?? t;
}

export const SIGNAL_TYPE_STYLES: Record<SignalType, string> = {
  FUNDING: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  HIRING: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  HEADCOUNT_GROWTH: "bg-cyan-500/10 text-cyan-500 ring-cyan-500/20",
  PRODUCT_LAUNCH: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  EXPANSION: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  LEADERSHIP_CHANGE: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  PARTNERSHIP: "bg-pink-500/10 text-pink-500 ring-pink-500/20",
};

// Default per-signal score contribution (per the scoring spec).
export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  FUNDING: 40,
  HIRING: 30, // finance-family hiring; non-finance roles score lower at detection time
  HEADCOUNT_GROWTH: 20,
  PRODUCT_LAUNCH: 15,
  EXPANSION: 15,
  LEADERSHIP_CHANGE: 10,
  PARTNERSHIP: 10,
};

// ----- Intent levels -----
export function intentLevelFromScore(score: number): IntentLevel {
  if (score >= 90) return "URGENT";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export const INTENT_LEVEL_LABELS: Record<IntentLevel, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const INTENT_LEVEL_STYLES: Record<IntentLevel, string> = {
  URGENT: "bg-red-500/10 text-red-500 ring-red-500/20",
  HIGH: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  LOW: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
};

// ----- Recommended action (rule-based, NOT AI) -----
export function recommendedAction(c: {
  intentLevel: IntentLevel;
  pipelineStage: PipelineStage;
}): string {
  const contacted = c.pipelineStage !== "NOT_REACHED_OUT";
  switch (c.intentLevel) {
    case "URGENT":
      return contacted ? "Re-engage today — strong new intent" : "Reach out today — urgent intent";
    case "HIGH":
      return contacted ? "Re-engage this week" : "Prioritize outreach this week";
    case "MEDIUM":
      return "Add to nurture and monitor";
    default:
      return "Monitor for new signals";
  }
}
