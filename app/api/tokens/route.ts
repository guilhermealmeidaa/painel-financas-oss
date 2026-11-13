import { NextResponse } from "next/server";
import { generateToken } from "@/lib/api-tokens";
import { requireUser } from "@/lib/supabase/user";

/** Cria um token de API (leitura; escrita só se pedida). O valor completo é devolvido UMA vez e não fica salvo. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "Claude").trim().slice(0, 60) || "Claude";
  const scopes = body?.write === true ? ["read", "write"] : ["read"];
  const { token, hash, prefix } = generateToken();
  const { error } = await supabase.from("api_tokens").insert({ user_id: userId, name, token_hash: hash, prefix, scopes });
  if (error) return NextResponse.json({ error: "Não foi possível criar o token" }, { status: 500 });
  return NextResponse.json({ token }, { status: 201, headers: { "cache-control": "no-store" } });
}
