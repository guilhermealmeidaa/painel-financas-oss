import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const PREFIX = "pf_";

/** Gera um token novo. O texto completo só existe aqui e na tela de criação; o banco guarda o hash. */
export function generateToken() {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Valida um token de API e devolve o dono. Atualiza last_used_at (no máximo 1x por minuto). */
export async function verifyApiToken(token: string | undefined): Promise<{ userId: string; tokenId: string } | null> {
  if (!token || !token.startsWith(PREFIX) || token.length < 40 || token.length > 100) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("api_tokens")
    .select("id, user_id, revoked_at, last_used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at) > 60_000) {
    await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { userId: data.user_id, tokenId: data.id };
}
