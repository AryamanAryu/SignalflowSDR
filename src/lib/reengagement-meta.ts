import type { ReEngagementSignalType } from "@prisma/client";

export const SIGNAL_LABELS: Record<ReEngagementSignalType, string> = {
  NEW_STAKEHOLDER: "New Stakeholder",
  STAKEHOLDER_PROMOTED: "Stakeholder Promoted",
  HEADCOUNT_GROWTH: "Headcount Growth",
};

export const SIGNAL_STYLES: Record<ReEngagementSignalType, string> = {
  NEW_STAKEHOLDER: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  STAKEHOLDER_PROMOTED: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  HEADCOUNT_GROWTH: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
};

export function signalLabel(t: ReEngagementSignalType): string {
  return SIGNAL_LABELS[t] ?? t;
}
