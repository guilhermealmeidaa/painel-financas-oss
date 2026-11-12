import { NextResponse } from "next/server";
import { addMonths } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/user";
import { isMonth } from "@/lib/validate";

/**
 * Copia entradas, fixos e teto do mês anterior para `month`, sem sobrescrever o que já existe.
 * Fixos de cartão (parcelas antigas) NÃO são copiados: eles mudam todo mês.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  if (!isMonth(b?.month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  const month = b.month as string;
  const prev = addMonths(month, -1);

  const [{ data: incomes }, { data: fixed }, { data: budget }, { data: curIncomes }, { data: curBudget }] = await Promise.all([
    supabase.from("incomes").select("description, kind, amount_cents").eq("month", prev),
    supabase.from("fixed_expenses").select("name, category, account_id, amount_cents").eq("month", prev).neq("category", "cartao"),
    supabase.from("monthly_budgets").select("id, cap_cents, method").eq("month", prev).maybeSingle(),
    supabase.from("incomes").select("description").eq("month", month),
    supabase.from("monthly_budgets").select("id").eq("month", month).maybeSingle(),
  ]);

  // 13º e similares não se repetem: copia só salário/freela/outro
  const have = new Set((curIncomes ?? []).map((i) => i.description));
  const newIncomes = (incomes ?? [])
    .filter((i) => i.kind !== "13o" && !have.has(i.description))
    .map((i) => ({ ...i, user_id: userId, month }));
  if (newIncomes.length) await supabase.from("incomes").insert(newIncomes);

  if (fixed?.length) {
    await supabase
      .from("fixed_expenses")
      .upsert(fixed.map((f) => ({ ...f, user_id: userId, month })), { onConflict: "user_id,month,name", ignoreDuplicates: true });
  }

  let copiedBudget = false;
  if (budget && !curBudget) {
    const { data: nb } = await supabase
      .from("monthly_budgets")
      .insert({ user_id: userId, month, cap_cents: budget.cap_cents, method: budget.method === "credito" ? "debito_pix" : budget.method })
      .select("id")
      .single();
    const { data: alloc } = await supabase.from("budget_allocations").select("bucket, amount_cents").eq("budget_id", budget.id);
    if (nb && alloc?.length) {
      await supabase.from("budget_allocations").insert(alloc.map((a) => ({ ...a, user_id: userId, budget_id: nb.id })));
    }
    copiedBudget = Boolean(nb);
  }
  return NextResponse.json({ incomes: newIncomes.length, fixed: fixed?.length ?? 0, budget: copiedBudget });
}
