"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { resolveSignalAction } from "@/app/(dashboard)/re-engagement/actions";

export function ResolveSignalButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function resolve() {
    startTransition(async () => {
      const res = await resolveSignalAction(id);
      if (res.ok) {
        toast.success("Signal dismissed");
        router.refresh();
      } else toast.error(res.error ?? "Something went wrong");
    });
  }

  return (
    <button
      onClick={resolve}
      disabled={pending}
      title="Dismiss signal"
      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
