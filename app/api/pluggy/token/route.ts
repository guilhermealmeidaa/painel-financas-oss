import { NextResponse } from "next/server";
import { createConnectToken, pluggyConfigured } from "@/lib/pluggy/client";
import { requireUser } from "@/lib/supabase/user";

/** Connect token (30 min) para o widget. Com itemId, atualiza/reautoriza aquele item. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!pluggyConfigured()) return NextResponse.json({ error: "Pluggy não configurada" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  let itemId: string | undefined;
  if (body?.itemId) {
    // só permite atualizar item que é do usuário
    const { data } = await supabase.from("pluggy_items").select("item_id").eq("item_id", String(body.itemId)).maybeSingle();
    if (!data) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    itemId = data.item_id;
  }
  try {
    const accessToken = await createConnectToken(itemId);
    return NextResponse.json({ accessToken }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o token" }, { status: 502 });
  }
}
