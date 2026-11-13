import { NextResponse } from "next/server";
import { monthOf } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Cria um período especial (ex.: viagem) com teto próprio, dentro de um mês. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 60);
  const start = String(body?.start_date ?? "");
  const end = String(body?.end_date ?? "");
  const cap = Number(body?.cap_cents);
  if (!name) return NextResponse.json({ error: "Dê um nome ao período" }, { status: 400 });
  if (!DATE.test(start) || !DATE.test(end) || end < start) return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });
  if (monthOf(start) !== monthOf(end)) return NextResponse.json({ error: "O período precisa ficar dentro de um mês" }, { status: 400 });
  if (!Number.isInteger(cap) || cap < 0 || cap > 10_000_000) return NextResponse.json({ error: "Teto inválido" }, { status: 400 });

  const supabase = await createClient();
  const month = monthOf(start);
  const [{ data: budget }, { data: others }] = await Promise.all([
    supabase.from("monthly_budgets").select("cap_cents").eq("month", month).maybeSingle(),
    supabase.from("budget_periods").select("start_date, end_date, cap_cents").eq("month", month),
  ]);
  if (!budget) return NextResponse.json({ error: "Cadastre o teto do dia a dia do mês primeiro" }, { status: 400 });
  if ((others ?? []).some((o) => start <= o.end_date && end >= o.start_date)) {
    return NextResponse.json({ error: "Já existe um período nessas datas" }, { status: 400 });
  }
  const reserved = (others ?? []).reduce((s, o) => s + o.cap_cents, 0) + cap;
  if (reserved > budget.cap_cents) return NextResponse.json({ error: "Os tetos dos períodos passam do teto do mês" }, { status: 400 });

  const { error } = await supabase.from("budget_periods").insert({ month, name, start_date: start, end_date: end, cap_cents: cap });
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
