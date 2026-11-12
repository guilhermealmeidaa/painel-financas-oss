import { NextResponse } from "next/server";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { syncUser } from "@/lib/pluggy/sync";
import { requireUser } from "@/lib/supabase/user";

export const maxDuration = 60;

/** Busca contas, cartões, faturas e transações de todos os items do usuário logado. */
export async function POST() {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!pluggyConfigured()) return NextResponse.json({ error: "Pluggy não configurada" }, { status: 503 });
  try {
    const items = await syncUser(supabase, userId);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Falha no sync" }, { status: 500 });
  }
}
