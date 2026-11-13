import { NextResponse } from "next/server";
import { cronAdmin, cronAuthorized } from "@/lib/cron-auth";
import { runDailySummary } from "@/lib/notify-run";

export const maxDuration = 60;

/** Resumo do dia por push (GitHub Actions às 21h de Brasília). Protegido por CRON_SECRET. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const admin = cronAdmin();
  if (!admin) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const users = [...new Set((subs ?? []).map((s) => s.user_id))];
  let sent = 0;
  for (const u of users) if (await runDailySummary(admin, u)) sent++;
  return NextResponse.json({ users: users.length, sent });
}
