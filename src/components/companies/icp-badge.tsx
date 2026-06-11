import type { IcpStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ICP_STATUS_LABELS, ICP_STATUS_STYLES } from "@/lib/icp";

export function IcpBadge({
  status,
  score,
}: {
  status: IcpStatus;
  score?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ICP_STATUS_STYLES[status]
      )}
    >
      {ICP_STATUS_LABELS[status]}
      {score != null && status !== "UNKNOWN" && (
        <span className="tabular-nums opacity-70">· {score}</span>
      )}
    </span>
  );
}
