import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAlerts, dailySummary, type AlertKind } from "@/lib/alerts";
import { bankBalance, loadAllFor, runProjection, type AllData } from "@/lib/data";
import type { Database } from "@/lib/database.types";
import { addMonths, monthOf, todayISO } from "@/lib/dates";
import { debtSummary } from "@/lib/debt";
import { notifyOnce, pushConfigured } from "@/lib/push";

type Admin = SupabaseClient<Database>;

async function prefsOf(admin: Admin, userId: string): Promise<Record<string, boolean>> {
  const { data } = await admin.from("settings").select("notifications").eq("user_id", userId).maybeSingle();
  return (data?.notifications ?? {}) as Record<string, boolean>;
}

/**
 * "Fotos" do mês para o Plano: no primeiro sync do mês, o previsto (saldo no fim, dívida que falta);
 * nos primeiros dias do mês, o realizado do mês anterior (saldo real nas contas ao virar o mês).
 */
export async function takeSnapshots(admin: Admin, userId: string, d: AllData, today: string) {
  const month = monthOf(today);
  const prev = addMonths(month, -1);
  const { data: have } = await admin.from("month_snapshots").select("month, kind").eq("user_id", userId).in("month", [month, prev]);
  const has = (m: string, k: string) => (have ?? []).some((h) => h.month === m && h.kind === k);
  const bal = bankBalance(d);
  const debt = debtSummary(d, today);
  if (!has(month, "inicio")) {
    const row = runProjection(d).find((r) => r.month === month);
    await admin.from("month_snapshots").insert({
      user_id: userId,
      month,
      kind: "inicio",
      projected_balance_cents: row?.balance ?? null,
      bank_balance_cents: bal?.cents ?? null,
      debt_remaining_cents: debt.remaining,
    });
  }
  // o saldo de hoje só representa o fim do mês anterior nos primeiros dias do mês
  if (!has(prev, "fim") && Number(today.slice(8)) <= 3 && bal) {
    await admin.from("month_snapshots").insert({ user_id: userId, month: prev, kind: "fim", bank_balance_cents: bal.cents, debt_remaining_cents: debt.remaining });
  }
}

/** Depois de cada sync: fotos do mês e alertas (cada um uma vez só). Devolve quantos alertas saíram. */
export async function runAlerts(admin: Admin, userId: string): Promise<number> {
  const today = todayISO();
  const d = await loadAllFor(admin, userId);
  await takeSnapshots(admin, userId, d, today);
  if (!pushConfigured()) return 0;
  const [{ data: items }, prefs] = await Promise.all([
    admin.from("pluggy_items").select("id, connector_name, status, last_synced_at").eq("user_id", userId),
    prefsOf(admin, userId),
  ]);
  const alerts = computeAlerts(d, items ?? [], today, new Date().toISOString(), prefs as Partial<Record<AlertKind, boolean>>);
  let sent = 0;
  for (const a of alerts) if (await notifyOnce(admin, userId, a.key, { title: a.title, body: a.body, url: a.url })) sent++;
  return sent;
}

/** Resumo do dia (cron das 21h). */
export async function runDailySummary(admin: Admin, userId: string): Promise<boolean> {
  if (!pushConfigured()) return false;
  const prefs = await prefsOf(admin, userId);
  if (prefs.resumo_diario === false) return false;
  const today = todayISO();
  const s = dailySummary(await loadAllFor(admin, userId), today);
  return s ? notifyOnce(admin, userId, `resumo:${today}`, s) : false;
}
