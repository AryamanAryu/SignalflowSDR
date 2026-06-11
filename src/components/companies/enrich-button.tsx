"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enrichCompanyAction } from "@/app/(dashboard)/companies/actions";

export function EnrichButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function enrich() {
    startTransition(async () => {
      const res = await enrichCompanyAction(companyId);
      if (res.ok && res.data) {
        const s = res.data;
        const parts: string[] = [];
        if (s.enriched) parts.push("company enriched");
        if (s.contactsAdded) parts.push(`${s.contactsAdded} new contacts`);
        if (s.contactsUpdated) parts.push(`${s.contactsUpdated} updated`);
        if (s.alerts) parts.push(`${s.alerts} re-engagement alerts`);
        toast.success(
          parts.length ? `Apollo: ${parts.join(", ")}.` : "Apollo sync complete."
        );
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button variant="outline" onClick={enrich} disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {pending ? "Enriching…" : "Enrich with Apollo"}
    </Button>
  );
}
