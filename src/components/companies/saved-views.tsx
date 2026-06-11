"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Star, Flame, Radar, Send, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_KEYS } from "@/lib/companies-meta";

type View = {
  label: string;
  icon: LucideIcon;
  params: Record<string, string>;
};

// Saved views are predefined filter combinations expressed as URL params.
const VIEWS: View[] = [
  { label: "All companies", icon: LayoutGrid, params: {} },
  { label: "My ICP Accounts", icon: Star, params: { icpStatus: "QUALIFIED" } },
  { label: "Hot Prospects", icon: Flame, params: { intentMin: "70", sort: "intentScore", order: "desc" } },
  { label: "New Signals", icon: Radar, params: { intentMin: "1", sort: "intentScore", order: "desc" } },
  { label: "Ready For CRM", icon: Send, params: { icpStatus: "QUALIFIED", crm: "NOT_IN" } },
];

export function SavedViews() {
  const searchParams = useSearchParams();

  function hrefFor(view: View): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(view.params)) params.set(k, v);
    const qs = params.toString();
    return qs ? `/companies?${qs}` : "/companies";
  }

  function isActive(view: View): boolean {
    const entries = Object.entries(view.params);
    if (entries.length === 0) {
      // "All" is active when no filter params are set.
      return FILTER_KEYS.every((k) => !searchParams.get(k));
    }
    return entries.every(([k, v]) => searchParams.get(k) === v);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {VIEWS.map((v) => {
        const active = isActive(v);
        const Icon = v.icon;
        return (
          <Link
            key={v.label}
            href={hrefFor(v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
