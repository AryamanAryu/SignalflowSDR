"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { resolveAlert } from "@/lib/services/reengagement";
import { resolveSignal } from "@/lib/services/signals";

export async function resolveAlertAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  await resolveAlert(id);
  revalidatePath("/re-engagement");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resolveSignalAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const signal = await resolveSignal(id);
  revalidatePath(`/companies/${signal.companyId}`);
  revalidatePath("/re-engagement");
  revalidatePath("/dashboard");
  return { ok: true };
}
