import { prisma } from "@/lib/db";

export async function listAlerts(resolved = false) {
  return prisma.reEngagementAlert.findMany({
    where: { resolved },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    include: {
      company: { select: { id: true, name: true, pipelineStage: true } },
      suggestedContact: {
        select: { id: true, name: true, title: true, linkedinUrl: true, email: true },
      },
    },
  });
}

export async function countOpenAlerts() {
  return prisma.reEngagementAlert.count({ where: { resolved: false } });
}

export async function resolveAlert(id: string) {
  return prisma.reEngagementAlert.update({
    where: { id },
    data: { resolved: true },
  });
}
