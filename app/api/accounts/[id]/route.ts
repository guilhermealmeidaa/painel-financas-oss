import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";

/**
 * PATCH { name }          renomeia a conta
 * PATCH { mergeInto: id } junta esta conta (vinda do banco) na conta indicada (ex.: "Nubank")
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);

  if (body?.mergeInto) {
    const { error } = await supabase.rpc("merge_accounts", { from_id: id, into_id: String(body.mergeInto) });
    if (error) return NextResponse.json({ error: `Não foi possível juntar: ${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // dias de fechamento/vencimento informados por você (ganham do que o banco indica)
  if (body?.closing_day !== undefined || body?.due_day !== undefined) {
    const day = (v: unknown) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
    };
    const closing = day(body.closing_day);
    const due = day(body.due_day);
    if (!closing || !due) return NextResponse.json({ error: "Dias inválidos (1 a 31)" }, { status: 400 });
    const { error } = await supabase.from("accounts").update({ closing_day: closing, due_day: due, days_source: "usuario" }).eq("id", id);
    if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Nome vazio" }, { status: 400 });
  const { error } = await supabase.from("accounts").update({ name }).eq("id", id);
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? "Já existe uma conta com esse nome" : "Não foi possível renomear" }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
