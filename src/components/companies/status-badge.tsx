import type { CompanyStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/companies-meta";

const STYLES: Record<CompanyStatus, string> = {
  NEW: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  REACHED_OUT: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  CUSTOMER: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
};

export function StatusBadge({ status }: { status: CompanyStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[status]
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
