import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ListContactsQuery } from "@/lib/validators/contacts";

export async function listContacts(q: ListContactsQuery) {
  const where: Prisma.ContactWhereInput = {};
  if (q.companyId) where.companyId = q.companyId;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { title: { contains: q.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getCompanyContacts(companyId: string) {
  return prisma.contact.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
  });
}
