import Link from "next/link";
import {
  Building2,
  Send,
  MessageSquare,
  CalendarCheck,
  TrendingUp,
  StickyNote,
  ArrowRightCircle,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "@prisma/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StageBadge } from "@/components/crm/stage-badge";
import {
  getCrmStats,
  getFollowUpsDue,
  getRecentActivities,
} from "@/lib/services/crm";
import {
  PIPELINE_STAGE_OPTIONS,
  STAGE_BAR_COLORS,
} from "@/lib/crm-meta";
import { formatDate, timeAgo } from "@/lib/format";

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  NOTE: StickyNote,
  STAGE_CHANGE: ArrowRightCircle,
  FOLLOW_UP: CalendarClock,
  MEETING: CalendarCheck,
  OUTREACH: Send,
};

export default async function CrmPage() {
  const [stats, followUps, activities] = await Promise.all([
    getCrmStats(),
    getFollowUpsDue(),
    getRecentActivities(),
  ]);

  const cards = [
    { label: "Total Companies", value: stats.total, icon: Building2 },
    { label: "Reached Out", value: stats.reachedOut, icon: Send },
    { label: "Replied", value: stats.replied, icon: MessageSquare },
    { label: "Meetings Booked", value: stats.meetings, icon: CalendarCheck },
    { label: "Conversion Rate", value: `${stats.conversionRate}%`, icon: TrendingUp },
  ];

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Your outreach pipeline at a glance."
      />

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{c.label}</span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {c.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline breakdown */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Pipeline by stage</h3>
          {stats.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No companies yet. Add companies and set their stage to see the
              pipeline.
            </p>
          ) : (
            <>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {PIPELINE_STAGE_OPTIONS.map((o) => {
                  const count = stats.byStage[o.value];
                  if (count === 0) return null;
                  return (
                    <div
                      key={o.value}
                      className={STAGE_BAR_COLORS[o.value]}
                      style={{ width: `${(count / stats.total) * 100}%` }}
                      title={`${o.label}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {PIPELINE_STAGE_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${STAGE_BAR_COLORS[o.value]}`}
                    />
                    <span className="text-muted-foreground">{o.label}</span>
                    <span className="ml-auto font-medium tabular-nums">
                      {stats.byStage[o.value]}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Follow-ups due + recent activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-semibold">Follow-ups due</h3>
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing due. Schedule follow-ups from a company&apos;s detail
                page.
              </p>
            ) : (
              <ul className="space-y-3">
                {followUps.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/companies/${c.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        Due {formatDate(c.nextFollowUpAt)}
                        {c.owner?.name ? ` · ${c.owner.name}` : ""}
                      </div>
                    </div>
                    <StageBadge stage={c.pipelineStage} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-semibold">Recent activity</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {activities.map((a) => {
                  const Icon = ACTIVITY_ICON[a.type];
                  return (
                    <li key={a.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          {a.body}{" "}
                          <Link
                            href={`/companies/${a.company.id}`}
                            className="text-muted-foreground hover:underline"
                          >
                            · {a.company.name}
                          </Link>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.user?.name ? `${a.user.name} · ` : ""}
                          {timeAgo(a.occurredAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
