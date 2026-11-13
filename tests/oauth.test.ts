import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

let o: typeof import("@/lib/oauth");
let a: typeof import("@/lib/oauth-authorize");
beforeAll(async () => {
  process.env.OAUTH_SECRET = "teste-".repeat(8);
  o = await import("@/lib/oauth");
  a = await import("@/lib/oauth-authorize");
});

const ORIGIN = "https://painel.example";
const RESOURCE = `${ORIGIN}/api/mcp`;

describe("callbacks permitidos", () => {
  it("claude.ai/claude.com exatos e loopback http em qualquer porta", () => {
    expect(o.allowedRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(o.allowedRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(o.allowedRedirect("http://localhost:3118/callback")).toBe(true);
    expect(o.allowedRedirect("http://127.0.0.1:51234/callback")).toBe(true);
    expect(o.allowedRedirect("https://evil.example/callback")).toBe(false);
    expect(o.allowedRedirect("https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(o.allowedRedirect("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(o.allowedRedirect("http://user@localhost:1/callback")).toBe(false);
  });
  it("loopback casa ignorando a porta; o resto só exato", () => {
    expect(o.redirectMatches(["http://localhost/callback"], "http://localhost:4000/callback")).toBe(true);
    expect(o.redirectMatches(["http://localhost:1/callback"], "http://localhost:2/outro")).toBe(false);
    expect(o.redirectMatches(["https://claude.ai/api/mcp/auth_callback"], "https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
  });
});

describe("client_id assinado", () => {
  it("ida e volta; adulterado não vale", () => {
    const id = o.encodeClient({ name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], iat: 1 });
    expect(o.decodeClient(id)).toEqual({ name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], iat: 1 });
    const [body, sig] = id.slice(4).split(".");
    const evil = Buffer.from(JSON.stringify({ n: "Claude", r: ["https://evil.example/cb"], t: 1 })).toString("base64url");
    expect(o.decodeClient(`pfc_${evil}.${sig}`)).toBeNull();
    expect(o.decodeClient(`pfc_${body}.${sig.slice(0, -1)}x`)).toBeNull();
    expect(o.decodeClient("qualquer")).toBeNull();
  });
});

describe("PKCE, escopos e recurso", () => {
  it("S256 confere só com o verifier certo", () => {
    const verifier = "a".repeat(43) + "-._~";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(o.pkceOk(verifier, challenge)).toBe(true);
    expect(o.pkceOk("b".repeat(43), challenge)).toBe(false);
    expect(o.pkceOk("curto", challenge)).toBe(false);
  });
  it("escopos: padrão leitura; offline_access ignorado", () => {
    expect(o.parseScopes(null)).toEqual(["read"]);
    expect(o.parseScopes("offline_access")).toEqual(["read"]);
    expect(o.parseScopes("read write offline_access admin")).toEqual(["read", "write"]);
  });
  it("resource: só este MCP (maiúsculas e barra final aceitas)", () => {
    expect(o.sameResource("HTTPS://PAINEL.EXAMPLE/api/mcp/", RESOURCE)).toBe(true);
    expect(o.sameResource(`${ORIGIN}/api/outro`, RESOURCE)).toBe(false);
    expect(o.sameResource("https://evil.example/api/mcp", RESOURCE)).toBe(false);
  });
  it("metadados apontam um para o outro", () => {
    expect(o.protectedResourceMetadata(ORIGIN)).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN] });
    expect(o.authServerMetadata(ORIGIN)).toMatchObject({
      issuer: ORIGIN,
      code_challenge_methods_supported: ["S256"],
      registration_endpoint: `${ORIGIN}/oauth/register`,
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe("pedido de autorização", () => {
  const client = () => o.encodeClient({ name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], iat: 1 });
  const base = () =>
    ({
      response_type: "code",
      client_id: client(),
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      state: "xyz",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      resource: RESOURCE,
    }) as Record<string, string>;
  const run = (p: Record<string, string>) => a.checkAuthorize((k) => p[k] ?? null, ORIGIN, RESOURCE);

  it("válido", () => {
    expect(run(base())).toMatchObject({ ok: true, req: { clientName: "Claude", scopes: ["read"], state: "xyz" } });
  });
  it("callback não registrado: erro na tela, nunca redireciona", () => {
    expect(run({ ...base(), redirect_uri: "https://evil.example/cb" })).toMatchObject({ ok: false, fatal: expect.any(String) });
    expect(run({ ...base(), client_id: "x" })).toMatchObject({ ok: false, fatal: expect.any(String) });
  });
  it("sem PKCE S256 ou com outro resource: volta ao Claude com erro e iss", () => {
    const r = run({ ...base(), code_challenge_method: "plain" });
    expect(r.ok).toBe(false);
    const url = new URL((r as { redirect: string }).redirect);
    expect(url.searchParams.get("error")).toBe("invalid_request");
    expect(url.searchParams.get("iss")).toBe(ORIGIN);
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(new URL((run({ ...base(), resource: "https://evil.example/mcp" }) as { redirect: string }).redirect).searchParams.get("error")).toBe("invalid_target");
  });
});
