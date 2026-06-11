import { z } from "zod";

// Treats empty form strings as "not provided".
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url("Must be a valid URL").max(500).optional()
);

const optionalCount = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: "Employee count must be a number" })
    .int("Must be a whole number")
    .min(0)
    .max(10_000_000)
    .optional()
);

export const companyStatusEnum = z.enum(["NEW", "REACHED_OUT", "CUSTOMER"]);

// ----- Create / update a single company -----
export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  domain: optionalText(255),
  linkedinUrl: optionalUrl,
  country: optionalText(100),
  industry: optionalText(150),
  employeeCount: optionalCount,
  status: companyStatusEnum.default("NEW"),
});

export const updateCompanySchema = createCompanySchema.partial();

// ----- List query (search / filter / sort / pagination) -----
export const icpStatusEnum = z.enum([
  "UNKNOWN",
  "QUALIFIED",
  "REVIEW",
  "DISQUALIFIED",
]);

const optionalInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(0).optional()
);

export const regionEnum = z.enum(["INDIA", "US", "SEA"]);
export const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const signalFilterEnum = z.enum([
  "FUNDING",
  "HIRING",
  "EXPANSION",
  "PRODUCT_LAUNCH",
]);
export const crmFilterEnum = z.enum(["IN", "NOT_IN"]);
export const assignedFilterEnum = z.enum(["ASSIGNED", "UNASSIGNED"]);

export const listCompaniesQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  status: companyStatusEnum.optional(),
  // Advanced filters
  region: regionEnum.optional(),
  country: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  industry: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  companyType: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  empMin: optionalInt,
  empMax: optionalInt,
  billing: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  icpStatus: icpStatusEnum.optional(),
  icpMin: optionalInt,
  icpMax: optionalInt,
  intentMin: optionalInt,
  intentMax: optionalInt,
  priority: priorityEnum.optional(),
  signal: signalFilterEnum.optional(),
  crm: crmFilterEnum.optional(),
  assigned: assignedFilterEnum.optional(),
  // Sort / paginate
  sort: z
    .enum(["name", "createdAt", "employeeCount", "status", "icpScore", "intentScore"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ----- Bulk operations -----
export const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one company"),
  status: companyStatusEnum,
});

export const bulkIcpStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one company"),
  status: icpStatusEnum,
});

export const assignOwnerSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one company"),
  ownerId: z.string().min(1).nullable(),
});

export const pushToCrmSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one company"),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one company"),
});

// ----- A single row coming from a CSV import (lenient) -----
export const csvCompanyRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: optionalText(255),
  linkedinUrl: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  country: optionalText(100),
  industry: optionalText(150),
  employeeCount: optionalCount,
  status: companyStatusEnum.optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
export type CsvCompanyRow = z.infer<typeof csvCompanyRowSchema>;
