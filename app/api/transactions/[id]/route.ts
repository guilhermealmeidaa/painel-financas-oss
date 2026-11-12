import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKETS = ["lazer", "mercado", "fixo", "assinatura", "parcela", "ignorar", "sem_categoria"] as const;

/**
 * PATCH { bucket }       você classifica: trava a escolha (o motor nunca mais mexe) e apaga o motivo automático.
 * PATCH { undo: true }   desfaz a decisão automática: volta ao bucket anterior e trava.
 * PATCH { unlock: true } devolve a transação para o motor decidir de novo.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const supabase = await createClient();

  if (body?.undo || body?.unlock) {
    const { data: t } = await supabase.from("transactions").select("prev_bucket, auto_reason").eq("id", id).maybeSingle();
    if (!t) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    const patch = body.undo
      ? { bucket: t.prev_bucket ?? ("sem_categoria" as const), auto_reason: null, user_locked: true }
      : { user_locked: false };
    const { error } = await supabase.from("transactions").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const bucket = body?.bucket as (typeof BUCKETS)[number];
  if (!BUCKETS.includes(bucket)) return NextResponse.json({ error: "Bucket inválido" }, { status: 400 });
  const { error, count } = await supabase
    .from("transactions")
    .update({ bucket, user_locked: true, auto_reason: null }, { count: "exact" })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Apaga um lançamento manual (RLS garante que é do usuário). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("transactions")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("source", "manual");
  if (error) return NextResponse.json({ error: "Não foi possível apagar" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
