import { NextResponse } from "next/server";
import { ALERT_KINDS } from "@/lib/alert-kinds";
import { requireUser } from "@/lib/supabase/user";

const KEYS = new Set<string>(ALERT_KINDS.map((k) => k.key));

/** Liga/desliga um tipo de aviso. Body: { key, on }. */
export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { key?: string; on?: boolean } | null;
  if (!body?.key || !KEYS.has(body.key) || typeof body.on !== "boolean") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const { data } = await supabase.from("settings").select("notifications").eq("user_id", userId).maybeSingle();
  const next = { ...((data?.notifications ?? {}) as Record<string, boolean>), [body.key]: body.on };
  const { error } = await supabase.from("settings").update({ notifications: next }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ notifications: next });
}
