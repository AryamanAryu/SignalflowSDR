"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Radar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanCompanyAction } from "@/app/(dashboard)/companies/actions";

export function ScanButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function scan() {
    startTransition(async () => {
      const res = await scanCompanyAction(companyId);
      if (res.ok && res.data) {
        toast.success(
          res.data.created > 0
            ? `${res.data.created} new signal${res.data.created === 1 ? "" : "s"} detected.`
            : res.data.changed
              ? "Scan complete — no new signals."
              : "No changes since last scan."
        );
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button variant="outline" onClick={scan} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
      {pending ? "Scanning…" : "Scan for signals"}
    </Button>
  );
}
