import type { Company, CompanySnapshot, SignalType } from "@prisma/client";

// A signal a collector detected on this pass (before it's persisted).
export type DetectedSignal = {
  signalType: SignalType;
  title: string;
  description?: string;
  source: string;
  sourceUrl?: string;
  score: number;
  // Stable key used to de-duplicate against existing open signals.
  dedupeKey: string;
};

export type ScanContext = {
  company: Company;
  previousSnapshot: CompanySnapshot | null;
};

// The pluggable contract. Add a new source by implementing this and
// registering it in registry.ts — the orchestrator does the rest.
export interface SignalCollector {
  key: string;
  label: string;
  /** true when the collector is fully implemented (vs a framework placeholder). */
  live: boolean;
  collect(ctx: ScanContext): Promise<DetectedSignal[]>;
}
