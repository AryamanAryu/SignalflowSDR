import { redirect } from "next/navigation";

// The app has no public landing page in v1 — send everyone to the dashboard.
// (Unauthenticated users are bounced to /sign-in by the Clerk middleware.)
export default function RootPage() {
  redirect("/dashboard");
}
