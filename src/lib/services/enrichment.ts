import {
  Prisma,
  type ReEngagementSignalType,
  type StakeholderChangeType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDomain } from "@/lib/dedupe";
import * as apollo from "@/lib/apollo";
import { qualifyCompany } from "@/lib/services/icp";

// Higher rank = more senior / more of a decision maker.
const SENIORITY_RANK: Record<string, number> = {
  owner: 6,
  founder: 6,
  c_suite: 6,
  partner: 5,
  vp: 5,
  head: 4,
  director: 4,
  manager: 3,
  senior: 2,
  entry: 1,
  intern: 0,
};
const DECISION_MAKER_MIN_RANK = 4; // director and up

const HEADCOUNT_GROWTH_PCT = 0.15; // 15%
const HEADCOUNT_GROWTH_MIN = 5; // and at least +5 people

function rank(seniority?: string | null): number {
  return seniority ? SENIORITY_RANK[seniority.toLowerCase()] ?? 0 : 0;
}
function isDecisionMaker(seniority?: string | null): boolean {
  return rank(seniority) >= DECISION_MAKER_MIN_RANK;
}

export type EnrichSummary = {
  ok: boolean;
  enriched: boolean;
  contactsAdded: number;
  contactsUpdated: number;
  changes: number;
  alerts: number;
  error?: string;
  usage?: apollo.ApolloUsage;
};

type AlertSpec = {
  signalType: ReEngagementSignalType;
  suggestedContactId?: string;
  reason: string;
  score: number;
  detail: Prisma.InputJsonValue;
};

export async function enrichCompany(companyId: string): Promise<EnrichSummary> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { contacts: true },
  });
  if (!company) {
    return {
      ok: false,
      enriched: false,
      contactsAdded: 0,
      contactsUpdated: 0,
      changes: 0,
      alerts: 0,
      error: "Company not found.",
    };
  }

  const domain = company.normalizedDomain ?? normalizeDomain(company.domain);
  if (!domain) {
    return {
      ok: false,
      enriched: false,
      contactsAdded: 0,
      contactsUpdated: 0,
      changes: 0,
      alerts: 0,
      error: "This company has no domain to enrich.",
    };
  }

  const previouslyReachedOut = company.pipelineStage !== "NOT_REACHED_OUT";
  // We only raise "new stakeholder" alerts once a baseline of contacts exists,
  // so the first enrichment establishes the baseline instead of flagging
  // everyone as new. Subsequent enrichments detect genuine changes.
  const hadBaseline = company.contacts.length > 0;
  const oldCount = company.employeeCount ?? null;

  const [enr, con] = await Promise.all([
    apollo.enrichCompany(domain),
    apollo.searchContacts(domain),
  ]);
  const usage = enr.usage ?? con.usage;

  const summary: EnrichSummary = {
    ok: false,
    enriched: false,
    contactsAdded: 0,
    contactsUpdated: 0,
    changes: 0,
    alerts: 0,
    usage,
  };

  // 1) Apply company enrichment.
  const data: Prisma.CompanyUpdateInput = { lastEnrichedAt: new Date() };
  let newCount = oldCount;
  if (enr.ok && enr.data) {
    const d = enr.data;
    if (d.employeeCount != null) {
      data.employeeCount = d.employeeCount;
      newCount = d.employeeCount;
    }
    if (d.description) data.description = d.description;
    if (d.industry) data.industry = d.industry;
    if (d.headquarters) data.headquarters = d.headquarters;
    if (d.apolloOrganizationId) data.apolloOrganizationId = d.apolloOrganizationId;
    if (d.linkedinUrl && !company.linkedinUrl) data.linkedinUrl = d.linkedinUrl;
    summary.enriched = true;
  } else {
    summary.error = enr.error;
  }
  await prisma.company.update({ where: { id: companyId }, data });

  // 1b) Re-qualify ICP from the freshly enriched industry/description.
  if (summary.enriched) {
    await qualifyCompany(companyId);
  }

  // 2) Sync contacts + detect changes.
  const existingByApollo = new Map(
    company.contacts
      .filter((c) => c.apolloContactId)
      .map((c) => [c.apolloContactId as string, c])
  );

  const changes: { type: StakeholderChangeType; contactId: string; detail: Prisma.InputJsonValue }[] = [];
  const alertSpecs: AlertSpec[] = [];

  if (con.ok && con.data) {
    for (const ac of con.data) {
      const existing = ac.apolloContactId
        ? existingByApollo.get(ac.apolloContactId)
        : undefined;

      if (existing) {
        const oldRank = rank(existing.seniority);
        const newRank = rank(ac.seniority);
        const titleChanged = (ac.title ?? null) !== (existing.title ?? null);

        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            name: ac.name,
            title: ac.title,
            seniority: ac.seniority,
            email: ac.email ?? existing.email,
            linkedinUrl: ac.linkedinUrl ?? existing.linkedinUrl,
            lastSeenAt: new Date(),
          },
        });
        summary.contactsUpdated++;

        if (newRank > oldRank) {
          changes.push({
            type: "PROMOTION",
            contactId: existing.id,
            detail: { from: existing.title ?? null, to: ac.title ?? null },
          });
          if (previouslyReachedOut) {
            alertSpecs.push({
              signalType: "STAKEHOLDER_PROMOTED",
              suggestedContactId: existing.id,
              reason: `${ac.name} was promoted to ${ac.title ?? "a more senior role"} at ${company.name}. A promoted champion is a strong reason to re-open the conversation.`,
              score: 50 + newRank * 5,
              detail: { from: existing.title ?? null, to: ac.title ?? null },
            });
          }
        } else if (titleChanged && ac.title) {
          changes.push({
            type: "TITLE_CHANGE",
            contactId: existing.id,
            detail: { from: existing.title ?? null, to: ac.title },
          });
        }
      } else {
        const created = await prisma.contact.create({
          data: {
            companyId,
            apolloContactId: ac.apolloContactId,
            name: ac.name,
            title: ac.title,
            seniority: ac.seniority,
            email: ac.email,
            linkedinUrl: ac.linkedinUrl,
          },
        });
        summary.contactsAdded++;
        changes.push({
          type: "NEW_EMPLOYEE",
          contactId: created.id,
          detail: { title: ac.title ?? null },
        });

        if (isDecisionMaker(ac.seniority)) {
          changes.push({
            type: "NEW_DECISION_MAKER",
            contactId: created.id,
            detail: { title: ac.title ?? null, seniority: ac.seniority ?? null },
          });
          if (previouslyReachedOut && hadBaseline) {
            alertSpecs.push({
              signalType: "NEW_STAKEHOLDER",
              suggestedContactId: created.id,
              reason: `${ac.name} (${ac.title ?? "decision maker"}) is a new decision maker at ${company.name}. New leadership often means new priorities — a good moment to revisit.`,
              score: 55 + rank(ac.seniority) * 5,
              detail: { title: ac.title ?? null, seniority: ac.seniority ?? null },
            });
          }
        }
      }
    }
  } else if (!summary.error) {
    summary.error = con.error;
  }

  // 3) Persist stakeholder changes.
  for (const ch of changes) {
    await prisma.stakeholderChange.create({
      data: { companyId, contactId: ch.contactId, type: ch.type, detail: ch.detail },
    });
  }
  summary.changes = changes.length;

  // 4) Headcount-growth re-engagement signal.
  if (previouslyReachedOut && oldCount && newCount && oldCount > 0) {
    const delta = newCount - oldCount;
    const pct = delta / oldCount;
    if (delta >= HEADCOUNT_GROWTH_MIN && pct >= HEADCOUNT_GROWTH_PCT) {
      const top = await pickTopContact(companyId);
      alertSpecs.push({
        signalType: "HEADCOUNT_GROWTH",
        suggestedContactId: top?.id,
        reason: `${company.name} grew from ${oldCount} to ${newCount} employees (+${Math.round(pct * 100)}%). Rapid hiring signals budget and expansion — worth revisiting.`,
        score: 40 + Math.min(Math.round(pct * 100), 40),
        detail: { from: oldCount, to: newCount },
      });
    }
  }

  // 5) Create alerts (deduped against existing open alerts).
  if (previouslyReachedOut) {
    for (const spec of alertSpecs) {
      const created = await createAlertIfAbsent(companyId, spec);
      if (created) summary.alerts++;
    }
  }

  summary.ok = summary.enriched || summary.contactsAdded > 0 || !summary.error;
  return summary;
}

async function pickTopContact(companyId: string) {
  const contacts = await prisma.contact.findMany({ where: { companyId } });
  if (contacts.length === 0) return null;
  return contacts.reduce((best, c) =>
    rank(c.seniority) > rank(best.seniority) ? c : best
  );
}

async function createAlertIfAbsent(
  companyId: string,
  spec: AlertSpec
): Promise<boolean> {
  const where: Prisma.ReEngagementAlertWhereInput = {
    companyId,
    signalType: spec.signalType,
    resolved: false,
  };
  // For person-specific signals, dedupe per contact; headcount dedupes per company.
  if (spec.signalType !== "HEADCOUNT_GROWTH") {
    where.suggestedContactId = spec.suggestedContactId;
  }

  const existing = await prisma.reEngagementAlert.findFirst({ where });
  if (existing) return false;

  await prisma.reEngagementAlert.create({
    data: {
      companyId,
      signalType: spec.signalType,
      reason: spec.reason,
      detail: spec.detail,
      suggestedContactId: spec.suggestedContactId,
      score: spec.score,
    },
  });
  return true;
}

// ----- Bulk enrichment (small batches; Apollo rate-limited) -----
export async function enrichMany(ids: string[]) {
  const capped = ids.slice(0, 25);
  let enriched = 0;
  let contactsAdded = 0;
  let alerts = 0;
  const errors: string[] = [];

  for (const id of capped) {
    const res = await enrichCompany(id);
    if (res.enriched) enriched++;
    contactsAdded += res.contactsAdded;
    alerts += res.alerts;
    if (res.error) errors.push(res.error);
  }

  return { processed: capped.length, enriched, contactsAdded, alerts, errors };
}
