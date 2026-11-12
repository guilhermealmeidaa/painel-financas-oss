import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { cents, FIXED_CATEGORIES, isMonth, monthsFrom, text } from "@/lib/validate";

/**
 * Cria (ou atualiza, se já existir com o mesmo nome no mês) um gasto fixo,
 * opcionalmente repetindo nos próximos N-1 meses.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const amount = cents(b?.amount_cents);
  const name = text(b?.name);
  const category = FIXED_CATEGORIES.includes(b?.category) ? b.category : null;
  const accountId = b?.account_id ? String(b.account_id) : null;
  if (!isMonth(b?.month) || amount == null || !name || !category) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const rows = monthsFrom(b.month, b?.repeat).map((month) => ({
    user_id: userId,
    month,
    name,
    category,
    account_id: category === "cartao" ? accountId : null,
    amount_cents: amount,
  }));
  const { error } = await supabase.from("fixed_expenses").upsert(rows, { onConflict: "user_id,month,name" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ saved: rows.length }, { status: 201 });
}
