import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Marca ou desmarca uma conta do mês como paga.
 * Desmarcar guarda `dismissed` para o sync não marcar de novo sozinho (ex.: fatura que ele achou paga).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const month = String(body?.month ?? "");
  const key = String(body?.key ?? "");
  const paid = Boolean(body?.paid);
  if (!/^\d{4}-\d{2}-01$/.test(month) || !/^(fixed|card):[\w-]+$/.test(key)) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bill_payments")
    .upsert({ month, key, dismissed: !paid, auto_reason: null }, { onConflict: "user_id,month,key" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
