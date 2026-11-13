import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { syncUser } from "@/lib/pluggy/sync";
import { runAlerts } from "@/lib/notify-run";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Sync diário (Vercel Cron). Fora do proxy de login; protegido por CRON_SECRET.
 * Usa a service role só aqui, porque não há sessão de usuário.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !pluggyConfigured()) return NextResponse.json({ error: "não configurado" }, { status: 503 });

  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await admin.from("pluggy_items").select("user_id");
  if (error) return NextResponse.json({ error: "falha ao ler items" }, { status: 500 });

  const users = [...new Set((rows ?? []).map((r) => r.user_id))];
  let items = 0;
  let failures = 0;
  let alerts = 0;
  for (const userId of users) {
    const res = await syncUser(admin, userId);
    items += res.length;
    failures += res.filter((r) => r.error).length;
    // depois do sync: fotos do mês (Plano) e alertas por push, cada um uma vez só
    try {
      alerts += await runAlerts(admin, userId);
    } catch (err) {
      console.error(JSON.stringify({ evt: "alertas_falharam", msg: (err as Error).message.slice(0, 120) }));
    }
  }
  // Também mantém o Supabase free ativo (evita pausa por inatividade).
  return NextResponse.json({ users: users.length, items, failures, alerts });
}
