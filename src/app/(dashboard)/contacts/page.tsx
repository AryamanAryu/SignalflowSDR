import Link from "next/link";
import { Users, Linkedin, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ContactsSearch } from "@/components/contacts/contacts-search";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listContactsQuerySchema } from "@/lib/validators/contacts";
import { listContacts } from "@/lib/services/contacts";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = listContactsQuerySchema.parse({
    search: raw.search,
    page: raw.page,
  });
  const { items, total, page, pageSize, totalPages } = await listContacts(query);

  const buildPageHref = (p: number) => {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    params.set("page", String(p));
    return `/contacts?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="People discovered at your accounts through Apollo enrichment."
      />

      {total === 0 && !query.search ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Open a company and click 'Enrich with Apollo' to discover contacts. They'll appear here automatically."
        />
      ) : (
        <div className="space-y-4">
          <ContactsSearch initial={query.search ?? ""} />

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                      No contacts match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/companies/${c.company.id}`}
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {c.company.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3 text-muted-foreground">
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
                          {!c.email && !c.linkedinUrl && "—"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
            <span>{total} contacts</span>
            <div className="flex items-center gap-2">
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="icon" disabled={page <= 1} asChild={page > 1}>
                {page > 1 ? (
                  <Link href={buildPageHref(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                )}
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} asChild={page < totalPages}>
                {page < totalPages ? (
                  <Link href={buildPageHref(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
