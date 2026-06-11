"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  StickyNote,
  ArrowRightCircle,
  CalendarClock,
  CalendarCheck,
  Send,
  Save,
  type LucideIcon,
} from "lucide-react";
import type { Activity, ActivityType, Company } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PIPELINE_STAGE_OPTIONS, PRIORITY_OPTIONS } from "@/lib/crm-meta";
import { timeAgo, toDateInputValue, toDateTimeInputValue } from "@/lib/format";
import {
  updateStageAction,
  addNoteAction,
  updateCrmAction,
} from "@/app/(dashboard)/crm/actions";

const NONE = "__none__";

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  NOTE: StickyNote,
  STAGE_CHANGE: ArrowRightCircle,
  FOLLOW_UP: CalendarClock,
  MEETING: CalendarCheck,
  OUTREACH: Send,
};

type ActivityWithUser = Activity & { user: { name: string | null } | null };
type UserOption = { id: string; name: string | null; email: string };

export function CrmSection({
  company,
  users,
  activities,
}: {
  company: Company;
  users: UserOption[];
  activities: ActivityWithUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // Quick stage control (saves immediately)
  function onStageChange(stage: string) {
    startTransition(async () => {
      const res = await updateStageAction(company.id, { stage });
      if (res.ok) {
        toast.success("Stage updated");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  // Editable CRM panel (controlled)
  const [priority, setPriority] = React.useState(company.priority);
  const [ownerId, setOwnerId] = React.useState(company.sdrOwnerId ?? NONE);
  const [nextFollowUp, setNextFollowUp] = React.useState(
    toDateInputValue(company.nextFollowUpAt)
  );
  const [meetingAt, setMeetingAt] = React.useState(
    toDateTimeInputValue(company.meetingAt)
  );
  const [meetingLink, setMeetingLink] = React.useState(company.meetingLink ?? "");
  const [notes, setNotes] = React.useState(company.notes ?? "");

  function saveCrm() {
    startTransition(async () => {
      const res = await updateCrmAction(company.id, {
        priority,
        sdrOwnerId: ownerId === NONE ? null : ownerId,
        nextFollowUpAt: nextFollowUp,
        meetingAt,
        meetingLink,
        notes,
      });
      if (res.ok) {
        toast.success("CRM details saved");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  // Add note
  const [note, setNote] = React.useState("");
  function submitNote() {
    if (!note.trim()) return;
    startTransition(async () => {
      const res = await addNoteAction(company.id, { body: note });
      if (res.ok) {
        setNote("");
        toast.success("Note added");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)]">
      {/* LEFT: editable CRM panel + add note */}
      <div className="space-y-6">
        <div className="rounded-xl border p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">CRM</h3>
            <div className="w-[180px]">
              <Select
                value={company.pipelineStage}
                onValueChange={onStageChange}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>SDR Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Next follow-up</Label>
              <Input
                type="date"
                value={nextFollowUp}
                onChange={(e) => setNextFollowUp(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Meeting date &amp; time</Label>
              <Input
                type="datetime-local"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Meeting link</Label>
              <Input
                placeholder="https://meet.google.com/..."
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Persistent notes about this account…"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={saveCrm} disabled={pending}>
              <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save CRM details"}
            </Button>
          </div>
        </div>

        {/* Add note */}
        <div className="rounded-xl border p-5">
          <h3 className="mb-3 text-sm font-semibold">Add a note</h3>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Log a call, an email, or any update…"
          />
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={submitNote} disabled={pending || !note.trim()}>
              <StickyNote className="h-4 w-4" /> Add note
            </Button>
          </div>
        </div>
      </div>

      {/* RIGHT: activity timeline */}
      <div className="rounded-xl border p-5">
        <h3 className="mb-4 text-sm font-semibold">Activity timeline</h3>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. Change the stage or add a note to start the
            timeline.
          </p>
        ) : (
          <ol className="space-y-4">
            {activities.map((a) => {
              const Icon = ACTIVITY_ICON[a.type];
              return (
                <li key={a.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.body}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.user?.name ? `${a.user.name} · ` : ""}
                      {timeAgo(a.occurredAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
