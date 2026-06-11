import { PageHeader } from "@/components/shared/page-header";
import { CompaniesTable } from "@/components/companies/companies-table";
import { listCompaniesQuerySchema } from "@/lib/validators/company";
import { FILTER_KEYS } from "@/lib/companies-meta";
import { listCompanies } from "@/lib/services/companies";
import { listUsers } from "@/lib/services/crm";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // Normalize to single string values.
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = Array.isArray(v) ? v[0] : v;

  // Validate; fall back to defaults if a hand-edited URL is invalid.
  const parsed = listCompaniesQuerySchema.safeParse(sp);
  const query = parsed.success ? parsed.data : listCompaniesQuerySchema.parse({});

  const [{ items, total, page, pageSize, totalPages }, users] = await Promise.all([
    listCompanies(query),
    listUsers(),
  ]);

  const activeFilterCount = FILTER_KEYS.filter((k) => sp[k]).length;

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Filter, qualify, and push your best accounts to CRM."
      />
      <CompaniesTable
        companies={items}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        search={query.search}
        sort={query.sort}
        order={query.order}
        activeFilterCount={activeFilterCount}
        rawQuery={sp}
        users={users}
      />
    </div>
  );
}
