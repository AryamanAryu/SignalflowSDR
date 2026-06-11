"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_STATUS_OPTIONS,
  REGION_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SIGNAL_FILTER_OPTIONS,
  FILTER_KEYS,
} from "@/lib/companies-meta";
import {
  ICP_STATUS_OPTIONS,
  ICP_CATEGORY_LABELS,
  BILLING_FILTER_OPTIONS,
} from "@/lib/icp";

const ALL = "ALL";
type State = Record<string, string>;

function emptyState(): State {
  const s: State = {};
  for (const k of FILTER_KEYS) s[k] = "";
  return s;
}

export function FiltersSheet({ activeCount }: { activeCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState<State>(emptyState());

  // Sync local state from the URL whenever the panel opens.
  React.useEffect(() => {
    if (!open) return;
    const next = emptyState();
    for (const k of FILTER_KEYS) next[k] = searchParams.get(k) ?? "";
    setF(next);
  }, [open, searchParams]);

  function set(key: string, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of FILTER_KEYS) {
      const v = f[k];
      if (v && v !== ALL) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of FILTER_KEYS) params.delete(k);
    params.delete("page");
    setF(emptyState());
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Advanced filters</SheetTitle>
          <SheetDescription>Combine any filters to build your view.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
          <SelectField label="Status" value={f.status} onChange={(v) => set("status", v)} options={COMPANY_STATUS_OPTIONS} allLabel="Any status" />
          <SelectField label="Region (HQ)" value={f.region} onChange={(v) => set("region", v)} options={REGION_OPTIONS} allLabel="Any region" />
          <TextField label="Country" value={f.country} onChange={(v) => set("country", v)} placeholder="e.g. India" />
          <TextField label="Industry" value={f.industry} onChange={(v) => set("industry", v)} placeholder="e.g. Fintech" />
          <SelectField
            label="Company Type (ICP category)"
            value={f.companyType}
            onChange={(v) => set("companyType", v)}
            options={ICP_CATEGORY_LABELS.map((c) => ({ value: c, label: c }))}
            allLabel="Any type"
          />
          <RangeField label="Employee count" minV={f.empMin} maxV={f.empMax} onMin={(v) => set("empMin", v)} onMax={(v) => set("empMax", v)} />
          <SelectField label="Billing model" value={f.billing} onChange={(v) => set("billing", v)} options={BILLING_FILTER_OPTIONS.map((b) => ({ value: b.value, label: b.label }))} allLabel="Any billing" />
          <SelectField label="ICP status" value={f.icpStatus} onChange={(v) => set("icpStatus", v)} options={ICP_STATUS_OPTIONS} allLabel="Any ICP status" />
          <RangeField label="ICP score" minV={f.icpMin} maxV={f.icpMax} onMin={(v) => set("icpMin", v)} onMax={(v) => set("icpMax", v)} />
          <RangeField label="Intent score" minV={f.intentMin} maxV={f.intentMax} onMin={(v) => set("intentMin", v)} onMax={(v) => set("intentMax", v)} />
          <SelectField label="Priority" value={f.priority} onChange={(v) => set("priority", v)} options={PRIORITY_FILTER_OPTIONS} allLabel="Any priority" />
          <SelectField label="Has signal" value={f.signal} onChange={(v) => set("signal", v)} options={SIGNAL_FILTER_OPTIONS} allLabel="Any / none" />
          <SelectField label="CRM" value={f.crm} onChange={(v) => set("crm", v)} options={[{ value: "IN", label: "In CRM" }, { value: "NOT_IN", label: "Not in CRM" }]} allLabel="Any" />
          <SelectField label="Owner" value={f.assigned} onChange={(v) => set("assigned", v)} options={[{ value: "ASSIGNED", label: "Assigned" }, { value: "UNASSIGNED", label: "Unassigned" }]} allLabel="Any" />
        </div>

        <SheetFooter className="flex-row gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={clearAll}>Clear all</Button>
          <Button onClick={apply}>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function RangeField({
  label,
  minV,
  maxV,
  onMin,
  onMax,
}: {
  label: string;
  minV: string;
  maxV: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} placeholder="Min" value={minV} onChange={(e) => onMin(e.target.value)} />
        <span className="text-muted-foreground">–</span>
        <Input type="number" min={0} placeholder="Max" value={maxV} onChange={(e) => onMax(e.target.value)} />
      </div>
    </div>
  );
}
