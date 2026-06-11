import { NextResponse } from "next/server";
import { scanAll } from "@/lib/services/signals";

// Daily scan trigger. Protected by a shared secret so only the scheduler
// (e.g. Vercel Cron) can call it:  Authorization: Bearer <CRON_SECRET>
//
// To enable daily runs, add to vercel.json:
//   { "crons": [{ "path": "/api/cron/scan", "schedule": "0 6 * * *" }] }
// and set CRON_SECRET in your environment.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bounded batch keeps each invocation within serverless time limits.
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 300);

  const result = await scanAll(limit);
  return NextResponse.json({ data: result });
}
