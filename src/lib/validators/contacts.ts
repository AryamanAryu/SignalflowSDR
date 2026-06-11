import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const listContactsQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companyId: z.preprocess(emptyToUndefined, z.string().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
