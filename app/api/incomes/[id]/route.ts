import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { cents, INCOME_KINDS, text } from "@/lib/validate";

type Kind = (typeof INCOME_KINDS)[number];
const isKind = (v: unknown): v is Kind => (INCOME_KINDS as readonly string[]).includes(String(v));

/** Atualiza uma entrada. Com scope=forward, aplica também nos meses seguintes com a mesma descrição. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/incomes/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const { data: row } = await supabase.from("incomes").select("month, description").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const patch: { amount_cents?: number; description?: string; kind?: Kind } = {};
  if (b?.amount_cents !== undefined) {
    const v = cents(b.amount_cents);
    if (v == null) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    patch.amount_cents = v;
  }
  if (b?.description !== undefined) patch.description = text(b.description) || row.description;
  if (isKind(b?.kind)) patch.kind = b.kind;
  // entradas do banco: confirmar ou rejeitar ("não é entrada")
  if (b?.status === "confirmada" || b?.status === "rejeitada") (patch as { status?: string }).status = b.status;

  const q =
    b?.scope === "forward"
      ? supabase.from("incomes").update(patch).eq("description", row.description).gte("month", row.month)
      : supabase.from("incomes").update(patch).eq("id", id);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** ?scope=forward apaga também as entradas com a mesma descrição nos meses seguintes. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/incomes/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const forward = new URL(request.url).searchParams.get("scope") === "forward";
  const { data: row } = await supabase.from("incomes").select("month, description").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const q = forward
    ? supabase.from("incomes").delete().eq("description", row.description).gte("month", row.month)
    : supabase.from("incomes").delete().eq("id", id);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Não foi possível apagar" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
