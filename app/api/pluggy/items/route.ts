import { NextResponse } from "next/server";
import { getItem, pluggyConfigured, PluggyError } from "@/lib/pluggy/client";
import { requireUser } from "@/lib/supabase/user";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guarda um itemId (vindo do onSuccess do widget ou colado do Dashboard), validando na Pluggy. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!pluggyConfigured()) return NextResponse.json({ error: "Pluggy não configurada" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const itemId = String(body?.itemId ?? "").trim();
  if (!UUID.test(itemId)) return NextResponse.json({ error: "itemId inválido" }, { status: 400 });

  try {
    const item = await getItem(itemId);
    const { error } = await supabase.from("pluggy_items").upsert(
      {
        user_id: userId,
        item_id: item.id,
        status: item.status,
        connector_name: item.connector?.name ?? null,
        consent_expires_at: item.consentExpiresAt ?? null,
      },
      { onConflict: "user_id,item_id" },
    );
    if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
    return NextResponse.json({ itemId: item.id, connector: item.connector?.name ?? null, status: item.status });
  } catch (e) {
    const status = e instanceof PluggyError && e.status === 404 ? 404 : 502;
    return NextResponse.json({ error: status === 404 ? "Item não existe nesta aplicação" : "Falha ao consultar a Pluggy" }, { status });
  }
}
