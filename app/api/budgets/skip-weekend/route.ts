import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthOf } from "@/lib/dates";

/** Liga/desliga um fim de semana "sem gasto" (identificado pelo sábado) no orçamento do mês. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const saturday = String(body?.saturday ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saturday)) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: budget, error } = await supabase
    .from("monthly_budgets")
    .select("id, skipped_weekends")
    .eq("month", monthOf(saturday))
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Falha ao ler orçamento" }, { status: 500 });
  if (!budget) return NextResponse.json({ error: "Mês sem orçamento" }, { status: 404 });

  const set = new Set(budget.skipped_weekends);
  if (set.has(saturday)) set.delete(saturday);
  else set.add(saturday);
  const { error: upErr } = await supabase
    .from("monthly_budgets")
    .update({ skipped_weekends: [...set].sort() })
    .eq("id", budget.id);
  if (upErr) return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  return NextResponse.json({ skipped: [...set] });
}
