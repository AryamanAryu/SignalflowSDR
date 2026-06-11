import type { SignalCollector } from "../types";

// Compares the current employee count against the previous snapshot.
// Fires when growth is BOTH > 15% AND > 5 employees.
export const headcountCollector: SignalCollector = {
  key: "headcount",
  label: "Headcount growth",
  live: true,
  async collect({ company, previousSnapshot }) {
    const current = company.employeeCount;
    const previous = previousSnapshot?.employeeCount ?? null;
    if (current == null || previous == null || previous <= 0) return [];

    const delta = current - previous;
    const pct = delta / previous;
    if (delta > 5 && pct > 0.15) {
      const pctLabel = Math.round(pct * 100);
      return [
        {
          signalType: "HEADCOUNT_GROWTH",
          title: `Headcount grew ${pctLabel}% (${previous} → ${current})`,
          description: `Employee count rose by ${delta} (+${pctLabel}%) since the last scan — a sign of expansion and budget.`,
          source: "Headcount snapshot",
          score: 20,
          dedupeKey: `headcount:${current}`,
        },
      ];
    }
    return [];
  },
};
