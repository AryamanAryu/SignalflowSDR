"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { Company } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CompanyFormDialog } from "./company-form-dialog";
import { deleteCompaniesAction } from "@/app/(dashboard)/companies/actions";

export function CompanyDetailActions({ company }: { company: Company }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    if (!confirm(`Delete ${company.name}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteCompaniesAction({ ids: [company.id] });
      if (res.ok) {
        toast.success("Company deleted");
        router.push("/companies");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <CompanyFormDialog
        company={company}
        trigger={
          <Button variant="outline">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        }
      />
      <Button variant="ghost" className="text-destructive" onClick={onDelete} disabled={pending}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    </div>
  );
}
