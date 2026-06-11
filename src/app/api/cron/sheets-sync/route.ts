import { NextResponse } from "next/server";
import { runAutoSyncs } from "@/lib/services/sheets";

// Daily Google Sheets sync. Protected by a shared secret:
//   Authorization: Bearer <CRON_SECRET>
//
// Enable in vercel.json alongside the intent scan:
//   { "crons": [{ "path": "/api/cron/sheets-sync", "schedule": "0 5 * * *" }] }
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutoSyncs();
  return NextResponse.json({ data: result });
}
