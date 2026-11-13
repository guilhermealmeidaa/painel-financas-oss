import "server-only";
import { verifyApiToken } from "@/lib/api-tokens";
import { RATE_LIMIT_PER_MIN, resourceOf, sameResource, sha256 } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface McpCaller {
  userId: string;
  scopes: string[];
  /** chave do limite de chamadas e dos logs (nunca o token) */
  key: string;
  kind: "pf" | "oauth";
}

/** Bearer `pf_…` (Acesso do Claude) ou `pfa_…` (OAuth, só se emitido para ESTE recurso e a conexão não foi revogada). */
export async function authenticate(bearer: string | undefined, origin: string): Promise<McpCaller | null> {
  if (!bearer) return null;
  if (bearer.startsWith("pf_")) {
    const owner = await verifyApiToken(bearer);
    return owner ? { userId: owner.userId, scopes: owner.scopes, key: `pf:${owner.tokenId}`, kind: "pf" } : null;
  }
  if (!bearer.startsWith("pfa_") || bearer.length > 100) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: tok } = await admin.from("oauth_tokens").select("grant_id, user_id, expires_at").eq("token_hash", sha256(bearer)).eq("kind", "access").maybeSingle();
  if (!tok || Date.parse(tok.expires_at) <= Date.now()) return null;
  const { data: grant } = await admin.from("oauth_grants").select("id, scopes, resource, revoked_at, last_used_at").eq("id", tok.grant_id).single();
  if (!grant || grant.revoked_at || !sameResource(grant.resource, resourceOf(origin))) return null;
  if (!grant.last_used_at || Date.now() - Date.parse(grant.last_used_at) > 60_000) {
    await admin.from("oauth_grants").update({ last_used_at: new Date().toISOString() }).eq("id", grant.id);
  }
  return { userId: tok.user_id, scopes: grant.scopes, key: `oa:${grant.id}`, kind: "oauth" };
}

/** true = dentro do limite (120 chamadas/min por token). Se o banco falhar, deixa passar. */
export async function withinRateLimit(c: McpCaller): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return true;
  const { data, error } = await admin.rpc("hit_rate_limit", { p_user: c.userId, p_key: c.key, p_limit: RATE_LIMIT_PER_MIN });
  return error ? true : data !== false;
}

/** Identificador curto para log: nunca o token, nunca dados bancários. */
export const logId = (c: McpCaller) => `${c.kind}:${sha256(c.key).slice(0, 8)}`;
