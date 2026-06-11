"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Upload,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import {
  saveSheetConnectionAction,
  testSheetConnectionAction,
  loadSheetColumnsAction,
  saveSheetMappingAction,
  setSheetAutoSyncAction,
  syncSheetNowAction,
} from "@/app/(dashboard)/settings/actions";

const NONE = "__none__";

const TARGET_FIELDS = [
  { key: "name", label: "Company Name", required: true },
  { key: "domain", label: "Domain", required: true },
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "employeeCount", label: "Employee Count" },
  { key: "status", label: "Status" },
];

type SafeConnection = {
  id: string;
  sheetUrl: string;
  sheetName: string | null;
  serviceAccountEmail: string | null;
  columnMapping: unknown;
  autoDailySync: boolean;
  lastSyncAt: Date | null;
  lastImported: number;
  lastUpdated: number;
  lastFailed: number;
  hasCredentials: boolean;
};

type HistoryRow = {
  id: string;
  status: string;
  rowsImported: number;
  rowsUpdated: number;
  rowsFailed: number;
  startedAt: Date;
};

export function GoogleSheetsCard({
  connection,
  histories,
}: {
  connection: SafeConnection | null;
  histories: HistoryRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const savedMapping = (connection?.columnMapping as Record<string, string>) ?? {};

  const [sheetUrl, setSheetUrl] = React.useState(connection?.sheetUrl ?? "");
  const [credentialsJson, setCredentialsJson] = React.useState("");
  const [credFileName, setCredFileName] = React.useState("");
  const [sheetName, setSheetName] = React.useState(connection?.sheetName ?? "");
  const [tabs, setTabs] = React.useState<string[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const f of TARGET_FIELDS) m[f.key] = savedMapping[f.key] ?? NONE;
    return m;
  });
  const [autoSync, setAutoSync] = React.useState(connection?.autoDailySync ?? false);

  const optionHeaders = Array.from(
    new Set([...headers, ...Object.values(mapping).filter((v) => v && v !== NONE)])
  );

  function onCredFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCredentialsJson(String(reader.result ?? ""));
      setCredFileName(file.name);
    };
    reader.readAsText(file);
  }

  function saveConnection() {
    startTransition(async () => {
      const res = await saveSheetConnectionAction({
        sheetUrl,
        credentialsJson: credentialsJson || undefined,
      });
      if (res.ok) {
        toast.success("Connection saved");
        setCredentialsJson("");
        setCredFileName("");
        router.refresh();
      } else toast.error(res.error ?? "Could not save");
    });
  }

  function testConnection() {
    startTransition(async () => {
      const res = await testSheetConnectionAction();
      if (res.ok) {
        setTabs(res.tabs);
        toast.success(`Connected${res.title ? ` to "${res.title}"` : ""} · ${res.tabs.length} tabs`);
      } else toast.error(res.error);
    });
  }

  function loadColumns() {
    if (!sheetName) {
      toast.error("Choose or type a tab name first.");
      return;
    }
    startTransition(async () => {
      const res = await loadSheetColumnsAction(sheetName);
      if (res.ok) {
        setHeaders(res.headers);
        toast.success(`Loaded ${res.headers.length} columns`);
      } else toast.error(res.error);
    });
  }

  function saveMapping() {
    if (mapping.name === NONE || mapping.domain === NONE) {
      toast.error("Company Name and Domain must be mapped.");
      return;
    }
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) if (v && v !== NONE) clean[k] = v;
    startTransition(async () => {
      const res = await saveSheetMappingAction(clean);
      if (res.ok) {
        toast.success("Mapping saved");
        router.refresh();
      } else toast.error(res.error ?? "Could not save mapping");
    });
  }

  function toggleAutoSync(checked: boolean) {
    setAutoSync(checked);
    startTransition(async () => {
      await setSheetAutoSyncAction(checked);
      router.refresh();
    });
  }

  function syncNow() {
    toast.info("Syncing from Google Sheets…");
    startTransition(async () => {
      const res = await syncSheetNowAction();
      if (res.ok) {
        toast.success(`Sync complete: ${res.rowsImported} imported, ${res.rowsUpdated} updated, ${res.rowsFailed} failed`);
        router.refresh();
      } else toast.error(res.error ?? "Sync failed");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Google Sheets</h3>
        </div>

        {/* 1. Connection */}
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Sheet URL</Label>
            <Input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="grid gap-2">
            <Label>Service-account JSON</Label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/40">
                <Upload className="h-4 w-4" />
                {credFileName || (connection?.hasCredentials ? "Replace JSON" : "Upload JSON")}
                <input type="file" accept=".json,application/json" className="hidden" onChange={onCredFile} />
              </label>
              {connection?.serviceAccountEmail && (
                <span className="truncate text-xs text-muted-foreground">
                  {connection.serviceAccountEmail}
                </span>
              )}
            </div>
            {connection?.serviceAccountEmail && (
              <p className="text-xs text-muted-foreground">
                Share your sheet with this email (Viewer) so the service account can read it.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={saveConnection} disabled={pending || !sheetUrl}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save connection
            </Button>
            {connection?.hasCredentials && (
              <Button variant="outline" onClick={testConnection} disabled={pending}>
                <RefreshCw className="h-4 w-4" /> Test connection
              </Button>
            )}
          </div>
        </div>

        {/* 2. Tab + column mapping */}
        {connection?.hasCredentials && (
          <div className="space-y-3 border-t pt-5">
            <Label>Tab &amp; column mapping</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                {tabs.length > 0 ? (
                  <Select value={sheetName} onValueChange={setSheetName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a tab" />
                    </SelectTrigger>
                    <SelectContent>
                      {tabs.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="Tab name (e.g. Sheet1)"
                  />
                )}
              </div>
              <Button variant="outline" onClick={loadColumns} disabled={pending}>
                Load columns
              </Button>
            </div>

            {optionHeaders.length > 0 && (
              <div className="grid gap-2">
                {TARGET_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-2 items-center gap-3">
                    <Label className="text-sm font-normal">
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? NONE}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Not mapped —</SelectItem>
                        {optionHeaders.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div>
                  <Button variant="outline" onClick={saveMapping} disabled={pending}>
                    Save mapping
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Sync dashboard */}
        {connection?.hasCredentials && (
          <div className="space-y-4 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoSync} onCheckedChange={(c) => toggleAutoSync(Boolean(c))} />
                Auto daily sync
              </label>
              <Button onClick={syncNow} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync now
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Last sync" value={connection.lastSyncAt ? formatDateTime(connection.lastSyncAt) : "—"} />
              <Stat label="Imported" value={connection.lastImported} />
              <Stat label="Updated" value={connection.lastUpdated} />
              <Stat label="Failed" value={connection.lastFailed} />
            </div>

            {histories.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Recent syncs</div>
                {histories.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      {h.status === "SUCCESS" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : h.status === "FAILED" ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {formatDateTime(h.startedAt)}
                    </span>
                    <span className="text-muted-foreground">
                      {h.rowsImported} imported · {h.rowsUpdated} updated · {h.rowsFailed} failed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
