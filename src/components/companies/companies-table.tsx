"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Building2,
  Sparkles,
  Radar,
  Target,
  Send,
  Download,
  UserPlus,
  CheckCircle2,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import type { Company, IcpStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { IcpBadge } from "./icp-badge";
import { IntentLevelBadge } from "@/components/intent/intent-badges";
import { CompanyFormDialog } from "./company-form-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
import { FiltersSheet } from "./filters-sheet";
import { SavedViews } from "./saved-views";
import {
  bulkUpdateStatusAction,
  deleteCompaniesAction,
  enrichManyAction,
  scanManyAction,
  qualifyManyAction,
  setIcpStatusAction,
  assignOwnerAction,
  pushToCrmAction,
  exportCompaniesAction,
  getMatchingIdsAction,
} from "@/app/(dashboard)/companies/actions";

type CompanyRow = Company & {
  owner: { id: string; name: string | null; email: string } | null;
};
type UserOption = { id: string; name: string | null; email: string };

const QUALIFY_OPTIONS: { value: IcpStatus; label: string }[] = [
  { value: "QUALIFIED", label: "Qualified" },
  { value: "REVIEW", label: "Needs Review" },
  { value: "DISQUALIFIED", label: "Not Qualified" },
];

interface Props {
  companies: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search?: string;
  sort: string;
  order: string;
  activeFilterCount: number;
  rawQuery: Record<string, string | undefined>;
  users: UserOption[];
}

export function CompaniesTable({
  companies,
  total,
  page,
  pageSize,
  totalPages,
  search: initialSearch,
  sort,
  order,
  activeFilterCount,
  rawQuery,
  users,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState(initialSearch ?? "");

  const navigate = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [searchParams, pathname, router]
  );

  React.useEffect(() => {
    if (search === (initialSearch ?? "")) return;
    const t = setTimeout(() => navigate({ search: search || null, page: "1" }), 400);
    return () => clearTimeout(t);
  }, [search, initialSearch, navigate]);

  // Reset selection when the visible rows change (page/filter navigation).
  React.useEffect(() => setSelected(new Set()), [companies]);

  function toggleSort(column: string) {
    const nextOrder = sort === column && order === "asc" ? "desc" : "asc";
    navigate({ sort: column, order: nextOrder, page: "1" });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected =
    companies.length > 0 && companies.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(companies.map((c) => c.id)));
  }

  function selectAllMatching() {
    startTransition(async () => {
      const res = await getMatchingIdsAction(rawQuery);
      if (res.ok && res.data) {
        setSelected(new Set(res.data));
        toast.success(`Selected all ${res.data.length} matching companies`);
      } else if (!res.ok) toast.error(res.error);
    });
  }

  const ids = () => [...selected];

  function afterBulk(message: string) {
    toast.success(message);
    setSelected(new Set());
    router.refresh();
  }

  function runSetIcp(status: IcpStatus, label: string) {
    startTransition(async () => {
      const res = await setIcpStatusAction({ ids: ids(), status });
      if (res.ok) afterBulk(`${res.data?.count ?? selected.size} marked ${label}`);
      else toast.error(res.error);
    });
  }

  function runAssign(ownerId: string | null, label: string) {
    startTransition(async () => {
      const res = await assignOwnerAction({ ids: ids(), ownerId });
      if (res.ok) afterBulk(`${res.data?.count ?? selected.size} ${label}`);
      else toast.error(res.error);
    });
  }

  function runPush() {
    startTransition(async () => {
      const res = await pushToCrmAction({ ids: ids() });
      if (res.ok && res.data) {
        const d = res.data;
        const parts = [`${d.pushed} pushed`];
        if (d.skippedNotQualified) parts.push(`${d.skippedNotQualified} not qualified`);
        if (d.skippedAlready) parts.push(`${d.skippedAlready} already in CRM`);
        afterBulk(parts.join(" · "));
      } else if (!res.ok) toast.error(res.error);
    });
  }

  function runExport() {
    const list = ids();
    startTransition(async () => {
      const res = await exportCompaniesAction(list);
      if (res.ok && res.data) {
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `signalflow-companies-${list.length}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${list.length} companies`);
      } else if (!res.ok) toast.error(res.error);
    });
  }

  function runEnrich() {
    startTransition(async () => {
      const res = await enrichManyAction(ids());
      if (res.ok && res.data) afterBulk(`Enriched ${res.data.enriched}/${res.data.processed} · ${res.data.contactsAdded} contacts`);
      else if (!res.ok) toast.error(res.error);
    });
  }

  function runScan() {
    startTransition(async () => {
      const res = await scanManyAction(ids());
      if (res.ok && res.data) afterBulk(`Scanned ${res.data.processed} · ${res.data.signalsCreated} signals`);
      else if (!res.ok) toast.error(res.error);
    });
  }

  function runQualifyIcp() {
    startTransition(async () => {
      const res = await qualifyManyAction(ids());
      if (res.ok && res.data) afterBulk(`Re-qualified ${res.data.processed}: ${res.data.qualified} ✓`);
      else if (!res.ok) toast.error(res.error);
    });
  }

  function runStatus(status: "NEW" | "REACHED_OUT" | "CUSTOMER", label: string) {
    startTransition(async () => {
      const res = await bulkUpdateStatusAction({ ids: ids(), status });
      if (res.ok) afterBulk(`${res.data?.count ?? selected.size} set ${label}`);
      else toast.error(res.error);
    });
  }

  function runDelete() {
    const list = ids();
    if (!confirm(`Delete ${list.length} compan${list.length === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteCompaniesAction({ ids: list });
      if (res.ok) afterBulk(`Deleted ${res.data?.count ?? list.length} companies`);
      else toast.error(res.error);
    });
  }

  // Per-row, single-click qualification.
  function setRowIcp(id: string, status: IcpStatus, label: string) {
    startTransition(async () => {
      const res = await setIcpStatusAction({ ids: [id], status });
      if (res.ok) {
        toast.success(`Marked ${label}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sort !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    return order === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const isEmptyWorkspace = total === 0 && activeFilterCount === 0 && !search;

  return (
    <div className="space-y-4">
      <SavedViews />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or domain…"
            className="pl-9"
          />
        </div>
        <FiltersSheet activeCount={activeFilterCount} />
        <CsvImportDialog trigger={<Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button>} />
        <CompanyFormDialog trigger={<Button><Plus className="h-4 w-4" /> Add company</Button>} />
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/40 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <CheckCircle2 className="h-4 w-4" /> Qualify <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Set qualification</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {QUALIFY_OPTIONS.map((o) => (
                <DropdownMenuItem key={o.value} onClick={() => runSetIcp(o.value, o.label)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={runPush} disabled={isPending}>
            <Send className="h-4 w-4" /> Push to CRM
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <UserPlus className="h-4 w-4" /> Assign <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Assign owner</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {users.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => runAssign(u.id, `assigned to ${u.name || u.email}`)}>
                  {u.name || u.email}
                </DropdownMenuItem>
              ))}
              {users.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => runAssign(null, "unassigned")}>Unassign</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={runExport} disabled={isPending}>
            <Download className="h-4 w-4" /> Export
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={runEnrich}><Sparkles className="h-4 w-4" /> Enrich (Apollo)</DropdownMenuItem>
              <DropdownMenuItem onClick={runScan}><Radar className="h-4 w-4" /> Scan for signals</DropdownMenuItem>
              <DropdownMenuItem onClick={runQualifyIcp}><Target className="h-4 w-4" /> Re-run ICP</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Company status</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => runStatus("NEW", "New")}>New</DropdownMenuItem>
              <DropdownMenuItem onClick={() => runStatus("REACHED_OUT", "Reached Out")}>Reached Out</DropdownMenuItem>
              <DropdownMenuItem onClick={() => runStatus("CUSTOMER", "Customer")}>Customer</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={runDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {isEmptyWorkspace ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add a company manually or import a CSV. Then enrich, score, qualify, and push your best accounts to CRM."
        />
      ) : (
        <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead><SortButton label="Company" onClick={() => toggleSort("name")}><SortIcon column="name" /></SortButton></TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right"><SortButton label="Emp." onClick={() => toggleSort("employeeCount")}><SortIcon column="employeeCount" /></SortButton></TableHead>
                  <TableHead><SortButton label="ICP" onClick={() => toggleSort("icpScore")}><SortIcon column="icpScore" /></SortButton></TableHead>
                  <TableHead><SortButton label="Intent" onClick={() => toggleSort("intentScore")}><SortIcon column="intentScore" /></SortButton></TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>CRM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                      No companies match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  companies.map((c) => (
                    <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleRow(c.id)} aria-label={`Select ${c.name}`} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                        <div className="text-xs text-muted-foreground">{c.domain ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.country ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.industry ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{c.employeeCount?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>
                        {/* Single-click qualification */}
                        <DropdownMenu>
                          <DropdownMenuTrigger className="outline-none">
                            <span className="inline-flex items-center gap-1">
                              <IcpBadge status={c.icpStatus} score={c.icpScore} />
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Set qualification</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {QUALIFY_OPTIONS.map((o) => (
                              <DropdownMenuItem key={o.value} onClick={() => setRowIcp(c.id, o.value, o.label)}>
                                {o.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell><IntentLevelBadge level={c.intentLevel} score={c.intentScore} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.owner ? c.owner.name || c.owner.email : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell>
                        {c.inCrm ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
                            In CRM
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Select-all-matching */}
          {allOnPageSelected && total > companies.length && (
            <div className="mt-2 rounded-md bg-accent/40 px-4 py-2 text-center text-xs text-muted-foreground">
              All {companies.length} on this page selected.{" "}
              <button className="font-medium text-foreground hover:underline" onClick={selectAllMatching} disabled={isPending}>
                Select all {total} matching
              </button>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
            <span>{start}–{end} of {total}</span>
            <div className="flex items-center gap-2">
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="icon" disabled={page <= 1 || isPending} onClick={() => navigate({ page: String(page - 1) })}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages || isPending} onClick={() => navigate({ page: String(page + 1) })}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 font-medium hover:text-foreground">
      {label}
      {children}
    </button>
  );
}
