import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";
import { cents, FIXED_CATEGORIES, text } from "@/lib/validate";

/** Atualiza um fixo. Com scope=forward, aplica o novo valor também nos meses seguintes (mesmo nome). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/fixed/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const { data: row } = await supabase.from("fixed_expenses").select("month, name").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const patch: { amount_cents?: number; name?: string; category?: (typeof FIXED_CATEGORIES)[number] } = {};
  if (b?.amount_cents !== undefined) {
    const v = cents(b.amount_cents);
    if (v == null) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    patch.amount_cents = v;
  }
  if (b?.name !== undefined) patch.name = text(b.name) || row.name;
  if (FIXED_CATEGORIES.includes(b?.category)) patch.category = b.category;

  const q =
    b?.scope === "forward"
      ? supabase.from("fixed_expenses").update(patch).eq("name", row.name).gte("month", row.month)
      : supabase.from("fixed_expenses").update(patch).eq("id", id);
  const { error } = await q;
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? "Já existe um fixo com esse nome no mês" : "Não foi possível salvar" }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}

/** ?scope=forward apaga também os meses seguintes com o mesmo nome. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/fixed/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const forward = new URL(request.url).searchParams.get("scope") === "forward";
  const { data: row } = await supabase.from("fixed_expenses").select("month, name").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const q = forward
    ? supabase.from("fixed_expenses").delete().eq("name", row.name).gte("month", row.month)
    : supabase.from("fixed_expenses").delete().eq("id", id);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Não foi possível apagar" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
