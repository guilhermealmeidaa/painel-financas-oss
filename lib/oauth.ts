import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Servidor de autorização OAuth 2.1 do conector do Claude (claude.ai / Claude Code).
 * - Registro dinâmico SEM estado: o client_id é assinado (HMAC) e carrega nome + callbacks.
 * - Só callbacks do Claude: claude.ai/claude.com e loopback (qualquer porta) do Claude Code.
 * - Código de 60 s com PKCE S256; access 1 h; refresh 30 dias, trocado a cada uso. O banco guarda só hashes.
 */

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
export const CODE_TTL_S = 60;
export const RATE_LIMIT_PER_MIN = 120;
export const SCOPES = ["read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

export const HOSTED_CALLBACKS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function secret(): string {
  const own = process.env.OAUTH_SECRET;
  if (own && own.length >= 32) return own;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("servidor sem OAUTH_SECRET/SUPABASE_SERVICE_ROLE_KEY");
  // sub-chave derivada: a chave de serviço nunca é usada diretamente
  return createHmac("sha256", base).update("painel-financas/oauth-client-id/v1").digest("hex");
}

/** Origem pública do pedido (Vercel: x-forwarded-*). */
export function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
export const resourceOf = (origin: string) => `${origin}/api/mcp`;

// ---------- callbacks ----------

/** Callback permitido? claude.ai/claude.com exatos, ou loopback http em qualquer porta (RFC 8252). */
export function allowedRedirect(uri: string): boolean {
  if (HOSTED_CALLBACKS.includes(uri)) return true;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1") && !u.username && !u.password && !u.hash;
}

/** O callback do pedido bate com um registrado? Loopback compara sem a porta. */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" || (u.hostname !== "localhost" && u.hostname !== "127.0.0.1")) return false;
  return registered.some((r) => {
    try {
      const x = new URL(r);
      return x.protocol === u.protocol && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search;
    } catch {
      return false;
    }
  });
}

// ---------- client_id assinado ----------

export interface ClientInfo {
  name: string;
  redirect_uris: string[];
  iat: number;
}

export function encodeClient(c: ClientInfo): string {
  const body = b64url(JSON.stringify({ n: c.name, r: c.redirect_uris, t: c.iat }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);
  return `pfc_${body}.${sig}`;
}

export function decodeClient(clientId: string | null | undefined): ClientInfo | null {
  if (!clientId || !clientId.startsWith("pfc_") || clientId.length > 4000) return null;
  const [body, sig] = clientId.slice(4).split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof j.n !== "string" || !Array.isArray(j.r)) return null;
    return { name: j.n, redirect_uris: j.r, iat: Number(j.t) || 0 };
  } catch {
    return null;
  }
}

// ---------- PKCE, escopos, tokens ----------

export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Escopos pedidos → os que existem (padrão: leitura). "offline_access" é aceito e ignorado (sempre há refresh). */
export function parseScopes(scope: string | null | undefined): Scope[] {
  const asked = (scope ?? "").split(/\s+/).filter(Boolean);
  const out = SCOPES.filter((s) => asked.includes(s));
  return out.length ? out : ["read"];
}

export const newSecret = (prefix: "pfa_" | "pfr_" | "pfo_") => `${prefix}${randomBytes(32).toString("base64url")}`;

/** Recurso pedido = este MCP? Aceita maiúsculas no esquema/host e sem barra final (RFC 8707). */
export function sameResource(asked: string | null | undefined, canonical: string): boolean {
  if (!asked) return true; // o claude.ai sempre manda; clientes antigos podem não mandar
  try {
    const a = new URL(asked);
    const c = new URL(canonical);
    return a.origin.toLowerCase() === c.origin.toLowerCase() && a.pathname.replace(/\/$/, "") === c.pathname;
  } catch {
    return false;
  }
}

// ---------- respostas ----------

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra },
  });
}

export const oauthError = (error: string, description: string, status = 400) => jsonResponse({ error, error_description: description }, status);

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Lê form-urlencoded (padrão OAuth) ou JSON. */
export async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (type.includes("application/json")) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      return new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams(text);
}

/** Metadados RFC 9728 (recurso) e RFC 8414 (servidor de autorização). */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceOf(origin),
    authorization_servers: [origin],
    scopes_supported: ["read"],
    bearer_methods_supported: ["header"],
    resource_name: "Painel de finanças",
  };
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write", "offline_access"],
    authorization_response_iss_parameter_supported: true,
  };
}
