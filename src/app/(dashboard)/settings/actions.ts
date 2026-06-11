"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { checkConnection, type ConnectionResult } from "@/lib/apollo";
import {
  saveConnection,
  testSavedConnection,
  loadColumns,
  saveMapping,
  setAutoSync,
  runSync,
} from "@/lib/services/sheets";

async function signedIn() {
  const { userId } = await auth();
  return Boolean(userId);
}

export async function testApolloConnectionAction(): Promise<ConnectionResult> {
  if (!(await signedIn())) return { ok: false, status: 401, message: "Not signed in." };
  return checkConnection();
}

// ----- Google Sheets -----
export async function saveSheetConnectionAction(input: {
  sheetUrl: string;
  credentialsJson?: string;
}) {
  if (!(await signedIn())) return { ok: false, error: "Not signed in" };
  const res = await saveConnection(input);
  revalidatePath("/settings");
  return res;
}

export async function testSheetConnectionAction() {
  if (!(await signedIn())) return { ok: false as const, error: "Not signed in" };
  return testSavedConnection();
}

export async function loadSheetColumnsAction(sheetName: string) {
  if (!(await signedIn())) return { ok: false as const, error: "Not signed in" };
  const res = await loadColumns(sheetName);
  revalidatePath("/settings");
  return res;
}

export async function saveSheetMappingAction(mapping: Record<string, string>) {
  if (!(await signedIn())) return { ok: false, error: "Not signed in" };
  const res = await saveMapping(mapping);
  revalidatePath("/settings");
  return res;
}

export async function setSheetAutoSyncAction(enabled: boolean) {
  if (!(await signedIn())) return { ok: false, error: "Not signed in" };
  const res = await setAutoSync(enabled);
  revalidatePath("/settings");
  return res;
}

export async function syncSheetNowAction() {
  if (!(await signedIn())) return { ok: false, rowsImported: 0, rowsUpdated: 0, rowsFailed: 0, error: "Not signed in" };
  const res = await runSync();
  revalidatePath("/settings");
  revalidatePath("/companies");
  revalidatePath("/dashboard");
  return res;
}
