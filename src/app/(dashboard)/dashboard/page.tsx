import Link from "next/link";
import { Building2, Send, CalendarCheck, Radar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCrmStats } from "@/lib/services/crm";
import { countHighIntent } from "@/lib/services/signals";

export default async function DashboardPage() {
  const [stats, highIntent] = await Promise.all([
    getCrmStats(),
    countHighIntent(),
  ]);

  const cards = [
    { label: "Companies", value: stats.total, icon: Building2, href: "/companies" },
    { label: "Reached out", value: stats.reachedOut, icon: Send, href: "/crm" },
    { label: "Meetings booked", value: stats.meetings, icon: CalendarCheck, href: "/crm" },
    { label: "High-intent accounts", value: highIntent, icon: Radar, href: "/re-engagement" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your SDR team's revenue intelligence at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="transition-colors hover:bg-accent/40">
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
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        See <Link href="/re-engagement" className="underline hover:text-foreground">Accounts Worth Revisiting</Link> for
        intent-ranked accounts and detected signals.
      </p>
    </div>
  );
}
