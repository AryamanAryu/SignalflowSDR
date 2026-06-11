"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveAlertAction } from "@/app/(dashboard)/re-engagement/actions";

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function resolve() {
    startTransition(async () => {
      const res = await resolveAlertAction(id);
      if (res.ok) {
        toast.success("Marked as resolved");
        router.refresh();
      } else toast.error(res.error ?? "Something went wrong");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={resolve} disabled={pending}>
      <Check className="h-4 w-4" /> Resolve
    </Button>
  );
}
