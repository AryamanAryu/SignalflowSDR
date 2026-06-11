import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Linkedin, Mail, Users, Radar, Target } from "lucide-react";
import { getCompany } from "@/lib/services/companies";
import { getCompanyActivities, listUsers } from "@/lib/services/crm";
import { getCompanyContacts } from "@/lib/services/contacts";
import { getCompanySignals } from "@/lib/services/signals";
import { StatusBadge } from "@/components/companies/status-badge";
import { CompanyDetailActions } from "@/components/companies/company-detail-actions";
import { EnrichButton } from "@/components/companies/enrich-button";
import { ScanButton } from "@/components/companies/scan-button";
import { QualifyButton } from "@/components/companies/qualify-button";
import { IcpBadge } from "@/components/companies/icp-badge";
import { StageBadge, PriorityBadge } from "@/components/crm/stage-badge";
import { CrmSection } from "@/components/crm/crm-section";
import { IntentLevelBadge, SignalTypeBadge } from "@/components/intent/intent-badges";
import { ResolveSignalButton } from "@/components/intent/resolve-signal-button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const [activities, users, contacts, signals] = await Promise.all([
    getCompanyActivities(id),
    listUsers(),
    getCompanyContacts(id),
    getCompanySignals(id),
  ]);
  const owner = users.find((u) => u.id === company.sdrOwnerId);

  const fields: { label: string; value: ReactNode }[] = [
    { label: "Domain", value: company.domain ?? "—" },
    { label: "Headquarters", value: company.headquarters ?? company.country ?? "—" },
    { label: "Industry", value: company.industry ?? "—" },
    { label: "Employee count", value: company.employeeCount?.toLocaleString() ?? "—" },
    { label: "SDR owner", value: owner ? owner.name || owner.email : "Unassigned" },
    { label: "Next follow-up", value: formatDate(company.nextFollowUpAt) },
    { label: "Last outreach", value: formatDate(company.lastOutreachAt) },
    { label: "Last enriched", value: formatDate(company.lastEnrichedAt) },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/companies"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to companies
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <IcpBadge status={company.icpStatus} score={company.icpScore} />
            <IntentLevelBadge level={company.intentLevel} score={company.intentScore} />
            <StageBadge stage={company.pipelineStage} />
            <PriorityBadge priority={company.priority} />
            <StatusBadge status={company.status} />
            {company.domain && (
              <a
                href={`https://${company.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {company.domain} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {company.linkedinUrl && (
              <a
                href={company.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Linkedin className="h-3.5 w-3.5" /> LinkedIn
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <QualifyButton companyId={company.id} />
          <ScanButton companyId={company.id} />
          <EnrichButton companyId={company.id} />
          <CompanyDetailActions company={company} />
        </div>
      </div>

      <Card className="mt-6">
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-5 p-6 sm:grid-cols-4">
          {fields.map((f) => (
            <div key={f.label}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {f.label}
              </div>
              <div className="mt-1 text-sm">{f.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {company.description && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {company.description}
        </p>
      )}

      {/* ICP qualification */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">ICP qualification</h3>
              <IcpBadge status={company.icpStatus} score={company.icpScore} />
            </div>
            <p className="text-sm text-muted-foreground">
              {company.icpReason ?? "Not yet qualified."}
            </p>
          </div>
          {company.icpCategory && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Category
              </div>
              <div className="mt-0.5 text-sm font-medium">{company.icpCategory}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intent signals */}
      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Radar className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Intent signals ({signals.length})</h3>
          </div>
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No signals yet. Click <span className="font-medium">Scan for signals</span> to check
              job boards and headcount changes.
            </p>
          ) : (
            <ul className="divide-y">
              {signals.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-4 py-2.5 ${s.resolved ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <SignalTypeBadge type={s.signalType} />
                      <span className="text-sm font-medium">{s.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.source} · {formatDate(s.detectedAt)} · score {s.signalScore}
                      {s.sourceUrl && (
                        <>
                          {" · "}
                          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                            view
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  {!s.resolved && <ResolveSignalButton id={s.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Contacts ({contacts.length})</h3>
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contacts yet. Click <span className="font-medium">Enrich with Apollo</span> to
              discover people at this company.
            </p>
          ) : (
            <ul className="divide-y">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.title ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {c.email && (
                      <a href={`mailto:${c.email}`} title={c.email}>
                        <Mail className="h-4 w-4 hover:text-foreground" />
                      </a>
                    )}
                    {c.linkedinUrl && (
                      <a href={c.linkedinUrl} target="_blank" rel="noreferrer">
                        <Linkedin className="h-4 w-4 hover:text-foreground" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      <CrmSection company={company} users={users} activities={activities} />
    </div>
  );
}
