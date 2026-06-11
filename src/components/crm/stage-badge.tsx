import type { PipelineStage, Priority } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  STAGE_STYLES,
  stageLabel,
  PRIORITY_STYLES,
  priorityLabel,
} from "@/lib/crm-meta";

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STAGE_STYLES[stage]
      )}
    >
      {stageLabel(stage)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        PRIORITY_STYLES[priority]
      )}
    >
      {priorityLabel(priority)}
    </span>
  );
}
