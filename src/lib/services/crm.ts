import { Prisma, type PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALL_STAGES, stageLabel } from "@/lib/crm-meta";
import { formatDate, formatDateTime } from "@/lib/format";
import type { UpdateCrmInput } from "@/lib/validators/crm";

const CONTACTED: PipelineStage[] = [
  "REACHED_OUT",
  "REPLIED",
  "MEETING_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
];
const REPLIED_PLUS: PipelineStage[] = [
  "REPLIED",
  "MEETING_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
];
const MEETINGS: PipelineStage[] = ["MEETING_BOOKED", "CLOSED_WON"];

// ----- Dashboard metrics -----
export async function getCrmStats() {
  const grouped = await prisma.company.groupBy({
    by: ["pipelineStage"],
    _count: { _all: true },
  });

  const byStage = Object.fromEntries(
    ALL_STAGES.map((s) => [s, 0])
  ) as Record<PipelineStage, number>;
  for (const g of grouped) byStage[g.pipelineStage] = g._count._all;

  const sum = (stages: PipelineStage[]) =>
    stages.reduce((acc, s) => acc + byStage[s], 0);

  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  const reachedOut = sum(CONTACTED);
  const replied = sum(REPLIED_PLUS);
  const meetings = sum(MEETINGS);
  const conversionRate =
    reachedOut > 0 ? Math.round((meetings / reachedOut) * 100) : 0;

  return { total, reachedOut, replied, meetings, conversionRate, byStage };
}

// ----- Follow-ups due (today or overdue, still open) -----
export async function getFollowUpsDue(limit = 20) {
  return prisma.company.findMany({
    where: {
      nextFollowUpAt: { lte: new Date() },
      pipelineStage: { notIn: ["CLOSED_WON", "CLOSED_LOST"] },
    },
    orderBy: { nextFollowUpAt: "asc" },
    take: limit,
    include: { owner: { select: { name: true, email: true } } },
  });
}

// ----- Recent activity across all companies -----
export async function getRecentActivities(limit = 12) {
  return prisma.activity.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      company: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
  });
}

// ----- Per-company timeline -----
export async function getCompanyActivities(companyId: string) {
  return prisma.activity.findMany({
    where: { companyId },
    orderBy: { occurredAt: "desc" },
    include: { user: { select: { name: true } } },
  });
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

// ----- Mutations (each logs a timeline Activity) -----

export async function updateStage(
  companyId: string,
  stage: PipelineStage,
  userId?: string
) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  const data: Prisma.CompanyUpdateInput = { pipelineStage: stage };
  // First time we move past "Not Reached Out", stamp the outreach date.
  if (stage !== "NOT_REACHED_OUT" && !company.lastOutreachAt) {
    data.lastOutreachAt = new Date();
  }

  await prisma.$transaction([
    prisma.company.update({ where: { id: companyId }, data }),
    prisma.activity.create({
      data: {
        companyId,
        userId,
        type: "STAGE_CHANGE",
        body: `Stage changed to ${stageLabel(stage)}`,
      },
    }),
  ]);
}

export async function addNote(companyId: string, body: string, userId?: string) {
  await prisma.activity.create({
    data: { companyId, userId, type: "NOTE", body },
  });
}

export async function updateCrm(
  companyId: string,
  input: UpdateCrmInput,
  userId?: string
) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  const data: Prisma.CompanyUpdateInput = {};
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.sdrOwnerId !== undefined) {
    data.owner = input.sdrOwnerId
      ? { connect: { id: input.sdrOwnerId } }
      : { disconnect: true };
  }
  if (input.nextFollowUpAt !== undefined) data.nextFollowUpAt = input.nextFollowUpAt;
  if (input.meetingAt !== undefined) data.meetingAt = input.meetingAt;
  if (input.meetingLink !== undefined) data.meetingLink = input.meetingLink;
  if (input.notes !== undefined) data.notes = input.notes;

  const activityCreates: Prisma.PrismaPromise<unknown>[] = [];

  const changed = (a?: Date | null, b?: Date | null) =>
    (a ? a.getTime() : null) !== (b ? b.getTime() : null);

  if (input.nextFollowUpAt && changed(input.nextFollowUpAt, company.nextFollowUpAt)) {
    activityCreates.push(
      prisma.activity.create({
        data: {
          companyId,
          userId,
          type: "FOLLOW_UP",
          body: `Follow-up scheduled for ${formatDate(input.nextFollowUpAt)}`,
        },
      })
    );
  }
  if (input.meetingAt && changed(input.meetingAt, company.meetingAt)) {
    activityCreates.push(
      prisma.activity.create({
        data: {
          companyId,
          userId,
          type: "MEETING",
          body: `Meeting scheduled for ${formatDateTime(input.meetingAt)}`,
        },
      })
    );
  }

  await prisma.$transaction([
    prisma.company.update({ where: { id: companyId }, data }),
    ...activityCreates,
  ]);
}
