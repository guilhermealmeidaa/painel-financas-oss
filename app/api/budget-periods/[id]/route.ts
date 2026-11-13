import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Remove um período especial (os gastos continuam lá; só voltam a contar no ritmo normal). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error } = await supabase.from("budget_periods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível remover" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
