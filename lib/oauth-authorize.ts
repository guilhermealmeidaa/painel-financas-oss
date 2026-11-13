import "server-only";
import { decodeClient, parseScopes, redirectMatches, sameResource, type Scope } from "@/lib/oauth";

export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scopes: Scope[];
  resource: string;
}

export type AuthorizeCheck =
  | { ok: true; req: AuthorizeRequest }
  /** erro antes de confiar no callback: mostra na tela, nunca redireciona */
  | { ok: false; fatal: string }
  /** erro depois de validar o callback: volta para o cliente com ?error= */
  | { ok: false; redirect: string };

/** Callback com os parâmetros da resposta, sempre com `iss` (RFC 9207). */
export function callbackUrl(redirectUri: string, params: Record<string, string | null>, issuer: string): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

/** Valida o pedido de autorização (OAuth 2.1 + PKCE S256 + RFC 8707). */
export function checkAuthorize(get: (k: string) => string | null, issuer: string, canonicalResource: string): AuthorizeCheck {
  const clientId = get("client_id");
  const client = decodeClient(clientId);
  if (!client || !clientId) return { ok: false, fatal: "Cliente desconhecido. Remova e adicione o conector de novo no Claude." };
  const redirectUri = get("redirect_uri") ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) return { ok: false, fatal: "Endereço de retorno (redirect_uri) não registrado." };

  const state = get("state");
  const fail = (error: string, description: string) => ({
    ok: false as const,
    redirect: callbackUrl(redirectUri, { error, error_description: description, state }, issuer),
  });
  if (get("response_type") !== "code") return fail("unsupported_response_type", "use response_type=code");
  const challenge = get("code_challenge");
  if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return fail("invalid_request", "code_challenge (PKCE) obrigatório");
  if (get("code_challenge_method") !== "S256") return fail("invalid_request", "use code_challenge_method=S256");
  if (!sameResource(get("resource"), canonicalResource)) return fail("invalid_target", "resource não é este servidor");

  return {
    ok: true,
    req: { clientId, clientName: client.name, redirectUri, state, challenge, scopes: parseScopes(get("scope")), resource: canonicalResource },
  };
}

/** Os parâmetros do pedido que a tela de consentimento repassa ao POST. */
export const AUTHORIZE_PARAMS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];
