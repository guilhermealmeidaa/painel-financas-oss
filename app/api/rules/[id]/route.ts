import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/rules/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error, count } = await supabase.from("categorization_rules").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível apagar" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
