"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { qualifyCompanyAction } from "@/app/(dashboard)/companies/actions";
import { ICP_STATUS_LABELS } from "@/lib/icp";

export function QualifyButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function qualify() {
    startTransition(async () => {
      const res = await qualifyCompanyAction(companyId);
      if (res.ok && res.data) {
        toast.success(`ICP: ${ICP_STATUS_LABELS[res.data.status]} (${res.data.score})`);
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button variant="outline" onClick={qualify} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
      {pending ? "Qualifying…" : "Qualify ICP"}
    </Button>
  );
}
