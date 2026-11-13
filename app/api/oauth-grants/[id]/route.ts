import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Revoga uma conexão OAuth do Claude (os tokens dela param de valer na hora). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error } = await supabase.from("oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) return NextResponse.json({ error: "Não foi possível revogar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
