import { allowedRedirect, encodeClient, jsonResponse, oauthError, preflight } from "@/lib/oauth";

/**
 * Registro dinâmico (RFC 7591), sem gravar nada: o client_id é assinado e carrega nome + callbacks.
 * Só aceita os callbacks do Claude (claude.ai/claude.com e loopback do Claude Code).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return oauthError("invalid_client_metadata", "JSON inválido");
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10) return oauthError("invalid_redirect_uri", "Informe de 1 a 10 redirect_uris");
  if (uris.some((u) => !allowedRedirect(u))) return oauthError("invalid_redirect_uri", "Callback não permitido: este servidor só aceita o Claude");
  const name =
    String(body.client_name ?? "Claude")
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 60) || "Claude";
  const iat = Math.floor(Date.now() / 1000);
  const client_id = encodeClient({ name, redirect_uris: uris, iat });
  console.info(JSON.stringify({ evt: "oauth_register", client: name, hosts: [...new Set(uris.map((u) => new URL(u).hostname))] }));
  return jsonResponse(
    {
      client_id,
      client_id_issued_at: iat,
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}
export const OPTIONS = preflight;
