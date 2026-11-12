import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { cents, isMonth, monthsFrom } from "@/lib/validate";

/**
 * Define o teto do dia a dia de um mês (e opcionalmente dos próximos N-1),
 * com o meio (crédito ou débito/Pix) e a divisão lazer/mercado.
 */
export async function PUT(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const cap = cents(b?.cap_cents);
  const lazer = cents(b?.lazer_cents ?? 0);
  const mercado = cents(b?.mercado_cents ?? 0);
  const method = b?.method === "credito" ? "credito" : "debito_pix";
  if (!isMonth(b?.month) || cap == null || lazer == null || mercado == null) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  if (lazer + mercado > cap) return NextResponse.json({ error: "Lazer + mercado passam do teto" }, { status: 400 });
  const controlStart = typeof b?.control_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.control_start) ? b.control_start : null;
  if (controlStart && controlStart.slice(0, 7) !== b.month.slice(0, 7)) {
    return NextResponse.json({ error: "O início do controle precisa ser dentro do mês" }, { status: 400 });
  }

  for (const month of monthsFrom(b.month, b?.repeat)) {
    const { data: budget, error } = await supabase
      .from("monthly_budgets")
      .upsert({ user_id: userId, month, cap_cents: cap, method, control_start: month === b.month ? controlStart : null }, { onConflict: "user_id,month" })
      .select("id")
      .single();
    if (error || !budget) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
    const alloc = [
      { user_id: userId, budget_id: budget.id, bucket: "lazer" as const, amount_cents: lazer },
      { user_id: userId, budget_id: budget.id, bucket: "mercado" as const, amount_cents: mercado },
    ];
    const { error: aErr } = await supabase.from("budget_allocations").upsert(alloc, { onConflict: "budget_id,bucket" });
    if (aErr) return NextResponse.json({ error: "Não foi possível salvar a divisão" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
