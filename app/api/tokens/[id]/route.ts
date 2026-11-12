import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";

/** Revoga um token (para de funcionar na hora). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/tokens/[id]">) {
  const { id } = await ctx.params;
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { error, count } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: "Não foi possível revogar" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
