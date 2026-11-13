import { createAdminClient } from "@/lib/supabase/admin";
import { CORS, preflight, readParams, sha256 } from "@/lib/oauth";

/** RFC 7009: revogar um token encerra a conexão inteira. Responde 200 mesmo se o token não existir. */
export async function POST(req: Request) {
  const admin = createAdminClient();
  const token = (await readParams(req)).get("token") ?? "";
  if (admin && token) {
    const { data } = await admin.from("oauth_tokens").select("grant_id").eq("token_hash", sha256(token)).maybeSingle();
    if (data) await admin.from("oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", data.grant_id).is("revoked_at", null);
  }
  return new Response(null, { status: 200, headers: { ...CORS, "cache-control": "no-store" } });
}
export const OPTIONS = preflight;
