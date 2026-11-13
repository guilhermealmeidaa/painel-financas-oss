import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCESS_TTL_S,
  REFRESH_TTL_S,
  decodeClient,
  jsonResponse,
  newSecret,
  oauthError,
  originOf,
  pkceOk,
  preflight,
  readParams,
  resourceOf,
  sameResource,
  sha256,
} from "@/lib/oauth";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function issue(admin: Admin, userId: string, grantId: string, scopes: string[]) {
  const access = newSecret("pfa_");
  const refresh = newSecret("pfr_");
  const now = Date.now();
  const { error } = await admin.from("oauth_tokens").insert([
    { token_hash: sha256(access), user_id: userId, grant_id: grantId, kind: "access", expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString() },
    { token_hash: sha256(refresh), user_id: userId, grant_id: grantId, kind: "refresh", expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString() },
  ]);
  if (error) return oauthError("server_error", "Falha ao emitir o token", 500);
  return jsonResponse({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") });
}

/** Troca código (PKCE S256) por tokens e renova pelo refresh (trocado a cada uso). Clientes públicos. */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return oauthError("server_error", "Servidor sem service role", 500);
  const p = await readParams(req);
  const grantType = p.get("grant_type");
  const clientId = p.get("client_id");
  const client = decodeClient(clientId);
  if (!client || !clientId) return oauthError("invalid_client", "client_id desconhecido", 401);
  if (!sameResource(p.get("resource"), resourceOf(originOf(req)))) return oauthError("invalid_target", "resource não é este servidor");

  if (grantType === "authorization_code") {
    // uso único: marca como usado; só segue quem conseguiu marcar
    const { data: row } = await admin
      .from("oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", sha256(p.get("code") ?? ""))
      .is("used_at", null)
      .select("*")
      .maybeSingle();
    if (!row || Date.parse(row.expires_at) < Date.now()) return oauthError("invalid_grant", "Código inválido ou expirado");
    if (row.client_id !== clientId) return oauthError("invalid_grant", "Código de outro cliente");
    if (row.redirect_uri !== p.get("redirect_uri")) return oauthError("invalid_grant", "redirect_uri diferente do pedido");
    if (!pkceOk(p.get("code_verifier") ?? "", row.code_challenge)) return oauthError("invalid_grant", "PKCE não confere");
    const { data: grant, error } = await admin
      .from("oauth_grants")
      .insert({
        user_id: row.user_id,
        client_name: row.client_name,
        client_hash: sha256(clientId),
        redirect_host: new URL(row.redirect_uri).hostname,
        scopes: row.scopes,
        resource: row.resource,
      })
      .select("id")
      .single();
    if (error) return oauthError("server_error", "Falha ao registrar a conexão", 500);
    console.info(JSON.stringify({ evt: "oauth_token", grant: "authorization_code", client: row.client_name, scopes: row.scopes }));
    return issue(admin, row.user_id, grant.id, row.scopes);
  }

  if (grantType === "refresh_token") {
    const { data: old } = await admin
      .from("oauth_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", sha256(p.get("refresh_token") ?? ""))
      .eq("kind", "refresh")
      .is("used_at", null)
      .select("user_id, grant_id, expires_at")
      .maybeSingle();
    if (!old || Date.parse(old.expires_at) < Date.now()) return oauthError("invalid_grant", "Refresh token inválido, usado ou expirado");
    const { data: grant } = await admin.from("oauth_grants").select("id, scopes, revoked_at, client_hash").eq("id", old.grant_id).single();
    if (!grant || grant.revoked_at) return oauthError("invalid_grant", "Conexão revogada");
    if (grant.client_hash !== sha256(clientId)) return oauthError("invalid_grant", "Refresh token de outro cliente");
    return issue(admin, old.user_id, grant.id, grant.scopes);
  }

  return oauthError("unsupported_grant_type", "Use authorization_code ou refresh_token");
}
export const OPTIONS = preflight;
