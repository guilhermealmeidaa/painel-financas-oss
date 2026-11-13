import { NextResponse } from "next/server";
import { CODE_TTL_S, newSecret, originOf, resourceOf, sha256, type Scope } from "@/lib/oauth";
import { callbackUrl, checkAuthorize } from "@/lib/oauth-authorize";
import { createClient } from "@/lib/supabase/server";

/** Resposta da tela de consentimento: cria o código (60 s, uso único) e volta para o Claude. */
export async function POST(req: Request) {
  const origin = originOf(req);
  // só aceita o POST vindo da própria tela (CSRF)
  const from = req.headers.get("origin");
  if (from && from !== origin) return NextResponse.json({ error: "origem inválida" }, { status: 403 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const form = await req.formData();
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };
  const check = checkAuthorize(get, origin, resourceOf(origin));
  if (!check.ok) {
    if ("redirect" in check) return NextResponse.redirect(check.redirect, 303);
    return NextResponse.json({ error: check.fatal }, { status: 400 });
  }
  const r = check.req;
  if (get("decision") !== "allow") {
    return NextResponse.redirect(callbackUrl(r.redirectUri, { error: "access_denied", error_description: "você cancelou", state: r.state }, origin), 303);
  }

  const scopes: Scope[] = get("write") === "1" ? ["read", "write"] : ["read"];
  const code = newSecret("pfo_");
  const { error } = await supabase.from("oauth_codes").insert({
    code_hash: sha256(code),
    client_id: r.clientId,
    client_name: r.clientName,
    redirect_uri: r.redirectUri,
    code_challenge: r.challenge,
    scopes,
    resource: r.resource,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) {
    return NextResponse.redirect(callbackUrl(r.redirectUri, { error: "server_error", error_description: "falha ao autorizar", state: r.state }, origin), 303);
  }
  return NextResponse.redirect(callbackUrl(r.redirectUri, { code, state: r.state }, origin), 303);
}
