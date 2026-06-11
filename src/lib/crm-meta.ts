import type { PipelineStage, Priority } from "@prisma/client";

// ----- Pipeline stages (the 6-step CRM lifecycle) -----
export const PIPELINE_STAGE_OPTIONS: {
  value: PipelineStage;
  label: string;
}[] = [
  { value: "NOT_REACHED_OUT", label: "Not Reached Out" },
  { value: "REACHED_OUT", label: "Reached Out" },
  { value: "REPLIED", label: "Replied" },
  { value: "MEETING_BOOKED", label: "Meeting Booked" },
  { value: "CLOSED_WON", label: "Closed Won" },
  { value: "CLOSED_LOST", label: "Closed Lost" },
];

export const ALL_STAGES: PipelineStage[] = PIPELINE_STAGE_OPTIONS.map(
  (o) => o.value
);

export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage;
}

export const STAGE_STYLES: Record<PipelineStage, string> = {
  NOT_REACHED_OUT: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  REACHED_OUT: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  REPLIED: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  MEETING_BOOKED: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  CLOSED_WON: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  CLOSED_LOST: "bg-red-500/10 text-red-500 ring-red-500/20",
};

// Used by the dashboard breakdown bar.
export const STAGE_BAR_COLORS: Record<PipelineStage, string> = {
  NOT_REACHED_OUT: "bg-zinc-500",
  REACHED_OUT: "bg-blue-500",
  REPLIED: "bg-violet-500",
  MEETING_BOOKED: "bg-amber-500",
  CLOSED_WON: "bg-emerald-500",
  CLOSED_LOST: "bg-red-500",
};

// ----- Priority -----
export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

export function priorityLabel(p: Priority): string {
  return PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p;
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  MEDIUM: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  HIGH: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
};
