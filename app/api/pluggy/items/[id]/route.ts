import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";

/** Remove o item do painel (não apaga transações já importadas nem desconecta na Pluggy). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/pluggy/items/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { error, count } = await supabase.from("pluggy_items").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível remover" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
