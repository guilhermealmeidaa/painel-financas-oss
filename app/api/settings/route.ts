import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { monthOf, todayISO } from "@/lib/dates";

const clean = (v: unknown, max = 40) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown, max = 10) =>
  (Array.isArray(v) ? v : String(v ?? "").split(/[\n,;]/))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, max);

/**
 * PATCH: preferências do usuário (cria a linha de settings no primeiro acesso).
 * - label_lazer / label_mercado: nomes das duas categorias do dia a dia
 * - self_names / self_tax_ids: seu nome e CPF/CNPJ, para reconhecer transferências entre suas contas
 */
export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const patch: { label_lazer?: string; label_mercado?: string; self_names?: string[]; self_tax_ids?: string[] } = {};
  if ("label_lazer" in body) patch.label_lazer = clean(body.label_lazer) || "Lazer";
  if ("label_mercado" in body) patch.label_mercado = clean(body.label_mercado) || "Mercado";
  if ("self_names" in body) patch.self_names = list(body.self_names).map((n) => n.slice(0, 80));
  if ("self_tax_ids" in body) patch.self_tax_ids = list(body.self_tax_ids).map((n) => n.replace(/\D/g, "")).filter((n) => n.length === 11 || n.length === 14);

  // a projeção começa no mês do primeiro acesso; depois disso nunca é sobrescrita aqui
  const { data: existing } = await supabase.from("settings").select("user_id").eq("user_id", userId).maybeSingle();
  const { error } = existing
    ? await supabase.from("settings").update(patch).eq("user_id", userId)
    : await supabase.from("settings").insert({ user_id: userId, projection_start: monthOf(todayISO()), ...patch });
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
