import type { IntentLevel, SignalType } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  INTENT_LEVEL_LABELS,
  INTENT_LEVEL_STYLES,
  SIGNAL_TYPE_LABELS,
  SIGNAL_TYPE_STYLES,
} from "@/lib/intent-meta";

export function IntentLevelBadge({
  level,
  score,
}: {
  level: IntentLevel;
  score?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        INTENT_LEVEL_STYLES[level]
      )}
    >
      {INTENT_LEVEL_LABELS[level]}
      {score != null && <span className="tabular-nums opacity-70">· {score}</span>}
    </span>
  );
}

export function SignalTypeBadge({
  type,
  count,
}: {
  type: SignalType;
  count?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        SIGNAL_TYPE_STYLES[type]
      )}
    >
      {SIGNAL_TYPE_LABELS[type]}
      {count != null && count > 1 && <span className="tabular-nums">×{count}</span>}
    </span>
  );
}
