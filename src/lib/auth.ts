import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";
import type { User } from "@prisma/client";

/**
 * Ensures the signed-in Clerk user has a matching row in our database.
 * Called from the dashboard layout so every authenticated session has a
 * local User record (used for attribution on outreach, admin checks, etc.).
 */
export async function ensureUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    null;

  return prisma.user.create({
    data: { clerkUserId: userId, email, name },
  });
}

/** Returns the local User for the current session, or null if signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkUserId: userId } });
}
