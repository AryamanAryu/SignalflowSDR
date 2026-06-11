"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ImportResult,
} from "@/lib/services/companies";
import { importCompaniesAction } from "@/app/(dashboard)/companies/actions";

const NONE = "__none__";

type TargetField = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

const TARGET_FIELDS: TargetField[] = [
  { key: "name", label: "Company Name", required: true, aliases: ["company name", "name", "company", "account"] },
  { key: "domain", label: "Domain", aliases: ["domain", "website", "url", "web"] },
  { key: "linkedinUrl", label: "LinkedIn URL", aliases: ["linkedin", "linkedin url"] },
  { key: "country", label: "Country", aliases: ["country", "location", "region"] },
  { key: "industry", label: "Industry", aliases: ["industry", "sector", "vertical"] },
  { key: "employeeCount", label: "Employee Count", aliases: ["employees", "employee count", "headcount", "size"] },
  { key: "status", label: "Status", aliases: ["status", "stage"] },
];

function parseStatus(v: unknown): string | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s === "new") return "NEW";
  if (s === "reached out" || s === "reached_out" || s === "reachedout") return "REACHED_OUT";
  if (s === "customer") return "CUSTOMER";
  return undefined;
}

type Step = "upload" | "map" | "done";

export function CsvImportDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [records, setRecords] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRecords([]);
    setMapping({});
    setResult(null);
  }

  function autoMap(fields: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const target of TARGET_FIELDS) {
      const found = fields.find((h) =>
        target.aliases.includes(h.trim().toLowerCase())
      );
      map[target.key] = found ?? NONE;
    }
    return map;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = res.meta.fields ?? [];
        if (fields.length === 0) {
          toast.error("Could not read any columns from that file.");
          return;
        }
        setHeaders(fields);
        setRecords(res.data);
        setMapping(autoMap(fields));
        setStep("map");
      },
      error: () => toast.error("Failed to parse the CSV file."),
    });
  }

  function runImport() {
    if (mapping.name === NONE || !mapping.name) {
      toast.error("You must map the Company Name column.");
      return;
    }

    const rows = records.map((rec) => {
      const row: Record<string, unknown> = {};
      for (const target of TARGET_FIELDS) {
        const col = mapping[target.key];
        if (col && col !== NONE) {
          const raw = rec[col];
          row[target.key] = target.key === "status" ? parseStatus(raw) : raw;
        }
      }
      return row;
    });

    startTransition(async () => {
      const res = await importCompaniesAction(rows);
      if (res.ok && res.data) {
        setResult(res.data);
        setStep("done");
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Import companies from CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Choose a CSV file. The first row should be column headers."}
            {step === "map" && "Match your CSV columns to company fields. We auto-matched what we could."}
            {step === "done" && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1 — upload */}
        {step === "upload" && (
          <label className="my-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center hover:bg-accent/40">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Click to choose a .csv file</span>
            <span className="text-xs text-muted-foreground">
              Columns like Company Name, Domain, LinkedIn URL, Country, Industry, Employee Count, Status
            </span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
        )}

        {/* STEP 2 — map columns */}
        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {fileName} · {records.length} rows
            </div>

            <div className="grid gap-3">
              {TARGET_FIELDS.map((target) => (
                <div key={target.key} className="grid grid-cols-2 items-center gap-3">
                  <Label className="text-sm">
                    {target.label}
                    {target.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[target.key] ?? NONE}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [target.key]: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Don&apos;t import —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 — result */}
        {step === "done" && result && (
          <div className="space-y-3 py-2">
            <ResultRow icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Imported" value={result.inserted} />
            <ResultRow icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Rows received" value={result.received} />
            <ResultRow icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} label="Skipped (duplicates)" value={result.skippedDuplicate} />
            <ResultRow icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Invalid rows" value={result.invalid.length} />
            {result.invalid.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                {result.invalid.slice(0, 20).map((e) => (
                  <div key={e.row}>Row {e.row}: {e.message}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")} disabled={pending}>
                Back
              </Button>
              <Button onClick={runImport} disabled={pending}>
                {pending ? "Importing…" : `Import ${records.length} rows`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => setOpen(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
