import type { CompanyStatus } from "@prisma/client";

// Single source of truth for how each status looks across the UI.
export const COMPANY_STATUS_OPTIONS: {
  value: CompanyStatus;
  label: string;
}[] = [
  { value: "NEW", label: "New" },
  { value: "REACHED_OUT", label: "Reached Out" },
  { value: "CUSTOMER", label: "Customer" },
];

export function statusLabel(status: CompanyStatus): string {
  return (
    COMPANY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  );
}

// Columns the table is allowed to sort by (kept in sync with the API validator).
export const SORTABLE_COLUMNS = [
  "name",
  "createdAt",
  "employeeCount",
  "status",
] as const;

export type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

// All advanced-filter URL keys (used to count active filters and clear them).
export const FILTER_KEYS = [
  "status",
  "region",
  "country",
  "industry",
  "companyType",
  "empMin",
  "empMax",
  "billing",
  "icpStatus",
  "icpMin",
  "icpMax",
  "intentMin",
  "intentMax",
  "priority",
  "signal",
  "crm",
  "assigned",
] as const;

export const REGION_OPTIONS = [
  { value: "INDIA", label: "India HQ" },
  { value: "US", label: "US HQ" },
  { value: "SEA", label: "Southeast Asia HQ" },
];

export const PRIORITY_FILTER_OPTIONS = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export const SIGNAL_FILTER_OPTIONS = [
  { value: "FUNDING", label: "Funding" },
  { value: "HIRING", label: "Hiring" },
  { value: "EXPANSION", label: "Expansion" },
  { value: "PRODUCT_LAUNCH", label: "Product Launch" },
];
