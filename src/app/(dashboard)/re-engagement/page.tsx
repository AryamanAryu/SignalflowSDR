import Link from "next/link";
import { Radar, Linkedin, Mail } from "lucide-react";
import type { SignalType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IntentLevelBadge, SignalTypeBadge } from "@/components/intent/intent-badges";
import { ResolveButton } from "@/components/reengagement/resolve-button";
import { getIntentDashboard } from "@/lib/services/signals";
import { listAlerts } from "@/lib/services/reengagement";
import { recommendedAction } from "@/lib/intent-meta";
import { SIGNAL_STYLES, signalLabel } from "@/lib/reengagement-meta";
import { formatDate } from "@/lib/format";

export default async function ReEngagementPage() {
  const [companies, alerts] = await Promise.all([
    getIntentDashboard(),
    listAlerts(false),
  ]);

  return (
    <div>
      <PageHeader
        title="Accounts Worth Revisiting"
        description="Companies ranked by buying intent, plus people changes worth a second look."
      />

      {/* Intent-ranked accounts */}
      {companies.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No intent signals yet"
          description="Open a company and click 'Scan for signals', or run a bulk scan from the Companies page. Detected signals rank accounts here by intent."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead>Last contacted</TableHead>
                <TableHead>Recommended action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => {
                const counts = new Map<SignalType, number>();
                for (const s of c.signals) {
                  counts.set(s.signalType, (counts.get(s.signalType) ?? 0) + 1);
                }
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <IntentLevelBadge level={c.intentLevel} score={c.intentScore} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {[...counts.entries()].map(([type, count]) => (
                          <SignalTypeBadge key={type} type={type} count={count} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.lastOutreachAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {recommendedAction({
                        intentLevel: c.intentLevel,
                        pipelineStage: c.pipelineStage,
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* People changes (Apollo re-engagement alerts) */}
      {alerts.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">People changes</h2>
          <div className="space-y-3">
            {alerts.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          SIGNAL_STYLES[a.signalType]
                        )}
                      >
                        {signalLabel(a.signalType)}
                      </span>
                      <Link
                        href={`/companies/${a.company.id}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {a.company.name}
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.reason}</p>
                    {a.suggestedContact && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-medium">{a.suggestedContact.name}</span>
                        {a.suggestedContact.title && (
                          <span className="text-muted-foreground">· {a.suggestedContact.title}</span>
                        )}
                        {a.suggestedContact.email && (
                          <a href={`mailto:${a.suggestedContact.email}`} className="text-muted-foreground hover:text-foreground">
                            <Mail className="h-4 w-4" />
                          </a>
                        )}
                        {a.suggestedContact.linkedinUrl && (
                          <a href={a.suggestedContact.linkedinUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <ResolveButton id={a.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
