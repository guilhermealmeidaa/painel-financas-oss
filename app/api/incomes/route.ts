import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { cents, INCOME_KINDS, isMonth, monthsFrom, text } from "@/lib/validate";

/** Cria uma entrada no mês (e opcionalmente repete nos próximos N-1 meses). */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const amount = cents(b?.amount_cents);
  const description = text(b?.description);
  const kind = INCOME_KINDS.includes(b?.kind) ? b.kind : "outro";
  if (!isMonth(b?.month) || amount == null || !description) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const rows = monthsFrom(b.month, b?.repeat).map((month) => ({ user_id: userId, month, description, kind, amount_cents: amount }));
  const { error } = await supabase.from("incomes").insert(rows);
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ created: rows.length }, { status: 201 });
}
