"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { testApolloConnectionAction } from "@/app/(dashboard)/settings/actions";
import type { ConnectionResult } from "@/lib/apollo";

export function ApolloConnectionCard({ configured }: { configured: boolean }) {
  const [result, setResult] = React.useState<ConnectionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  function test() {
    startTransition(async () => {
      const res = await testApolloConnectionAction();
      setResult(res);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Apollo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Powers company enrichment, contact discovery, and re-engagement
              signals.
            </p>
          </div>
          <Button variant="outline" onClick={test} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Test connection
          </Button>
        </div>

        {/* Key configuration status (from environment) */}
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          {configured ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                <code className="text-xs">APOLLO_API_KEY</code> is configured.
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span>
                <code className="text-xs">APOLLO_API_KEY</code> is missing. Add
                it to your <code className="text-xs">.env</code> file and restart
                the app.
              </span>
            </>
          )}
        </div>

        {/* Live connection result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={result.ok ? "text-emerald-500" : "text-destructive"}>
                {result.message}
              </span>
            </div>

            {result.usage && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Usage label="Per minute left" value={result.usage.minuteLeft} />
                <Usage label="Hourly left" value={result.usage.hourlyLeft} />
                <Usage label="Daily left" value={result.usage.dailyLeft} />
                <Usage label="Daily limit" value={result.usage.dailyLimit} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Usage({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">
        {value ?? "—"}
      </div>
    </div>
  );
}
