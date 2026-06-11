"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Company } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPANY_STATUS_OPTIONS } from "@/lib/companies-meta";
import {
  createCompanyAction,
  updateCompanyAction,
} from "@/app/(dashboard)/companies/actions";

interface Props {
  trigger: React.ReactNode;
  company?: Company; // when provided -> edit mode
}

export function CompanyFormDialog({ trigger, company }: Props) {
  const router = useRouter();
  const isEdit = Boolean(company);
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? ""),
      domain: String(fd.get("domain") ?? ""),
      linkedinUrl: String(fd.get("linkedinUrl") ?? ""),
      country: String(fd.get("country") ?? ""),
      industry: String(fd.get("industry") ?? ""),
      employeeCount: String(fd.get("employeeCount") ?? ""),
      status: String(fd.get("status") ?? "NEW"),
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateCompanyAction(company!.id, input)
        : await createCompanyAction(input);

      if (res.ok) {
        toast.success(isEdit ? "Company updated" : "Company added");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit company" : "Add company"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update this company's details."
                : "Manually add a company to your database."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Field label="Company name" required>
              <Input name="name" defaultValue={company?.name ?? ""} required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Domain">
                <Input name="domain" placeholder="stripe.com" defaultValue={company?.domain ?? ""} />
              </Field>
              <Field label="Country">
                <Input name="country" defaultValue={company?.country ?? ""} />
              </Field>
            </div>
            <Field label="LinkedIn URL">
              <Input
                name="linkedinUrl"
                placeholder="https://linkedin.com/company/..."
                defaultValue={company?.linkedinUrl ?? ""}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Industry">
                <Input name="industry" defaultValue={company?.industry ?? ""} />
              </Field>
              <Field label="Employee count">
                <Input
                  name="employeeCount"
                  type="number"
                  min={0}
                  defaultValue={company?.employeeCount ?? ""}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select name="status" defaultValue={company?.status ?? "NEW"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
