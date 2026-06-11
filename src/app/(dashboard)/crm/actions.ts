"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  updateStageSchema,
  addNoteSchema,
  updateCrmSchema,
} from "@/lib/validators/crm";
import { updateStage, addNote, updateCrm } from "@/lib/services/crm";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateStageAction(
  companyId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = updateStageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateStage(companyId, parsed.data.stage, user.id);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/crm");
  return { ok: true };
}

export async function addNoteAction(
  companyId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await addNote(companyId, parsed.data.body, user.id);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/crm");
  return { ok: true };
}

export async function updateCrmAction(
  companyId: string,
  input: unknown
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = updateCrmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateCrm(companyId, parsed.data, user.id);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/crm");
  return { ok: true };
}
