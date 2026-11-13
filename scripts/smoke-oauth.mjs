// Teste de fumaça dos endpoints públicos do OAuth/MCP, SEM cookie: cada um responde JSON e nunca 307.
// Uso: node scripts/smoke-oauth.mjs https://SEU-PAINEL.vercel.app   (padrão: http://localhost:3000)
const BASE = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CB = "https://claude.ai/api/mcp/auth_callback";
let failed = 0;

async function check(name, path, init, expectStatus, extra) {
  const res = await fetch(BASE + path, { redirect: "manual", ...init });
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  const problems = [];
  if (res.status >= 300 && res.status < 400) problems.push(`redirecionou (${res.status} → ${res.headers.get("location")})`);
  if (!expectStatus.includes(res.status)) problems.push(`status ${res.status}, esperado ${expectStatus.join("/")}`);
  let json = null;
  if (text) {
    if (!type.includes("application/json")) problems.push(`content-type ${type}`);
    try {
      json = JSON.parse(text);
    } catch {
      problems.push("corpo não é JSON");
    }
  }
  if (extra) problems.push(...extra(res, json));
  console.log(`${problems.length ? "FALHOU" : "ok    "} ${name.padEnd(42)} ${res.status}${problems.length ? "  " + problems.join("; ") : ""}`);
  if (problems.length) failed++;
  return json;
}
const cors = (res) => (res.headers.get("access-control-allow-origin") === "*" ? [] : ["sem CORS"]);

const prm = await check("GET /.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource", {}, [200], (r, j) => [
  ...cors(r),
  ...(j?.resource === `${BASE}/api/mcp` ? [] : [`resource = ${j?.resource}`]),
]);
await check("GET …/oauth-protected-resource/api/mcp", "/.well-known/oauth-protected-resource/api/mcp", {}, [200], (r, j) => [
  ...cors(r),
  ...(j?.resource === prm?.resource ? [] : ["difere da raiz"]),
]);
await check("OPTIONS /.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource", { method: "OPTIONS" }, [204], cors);
const as = await check("GET /.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server", {}, [200], (r, j) => [
  ...cors(r),
  ...(j?.issuer === BASE ? [] : [`issuer = ${j?.issuer}`]),
  ...(j?.code_challenge_methods_supported?.includes("S256") ? [] : ["sem S256"]),
]);
await check("OPTIONS /.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server", { method: "OPTIONS" }, [204], cors);
await check("POST /oauth/register (claude.ai)", "/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "smoke", redirect_uris: [CB], token_endpoint_auth_method: "none" }),
}, [201], (r, j) => (j?.client_id?.startsWith("pfc_") ? [] : ["sem client_id"]));
await check("POST /oauth/register (callback de fora)", "/oauth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }),
}, [400]);
await check("POST /oauth/token (código falso)", "/oauth/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", code: "x", client_id: "x", code_verifier: "x" }),
}, [400, 401], (r, j) => (j?.error ? [] : ["sem error"]));
await check("POST /oauth/revoke", "/oauth/revoke", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token: "pfa_inexistente" }),
}, [200]);
await check("POST /api/mcp sem token", "/api/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
}, [401], (r) => (/resource_metadata="[^"]+oauth-protected-resource/.test(r.headers.get("www-authenticate") ?? "") ? [] : ["WWW-Authenticate sem resource_metadata"]));
// /authorize sem login: vai para o /login PRESERVANDO os parâmetros (este é o único redirecionamento esperado)
{
  const res = await fetch(`${BASE}/oauth/authorize?response_type=code&client_id=x&state=abc`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  const next = loc ? new URL(loc, BASE).searchParams.get("next") : null;
  const ok = res.status === 307 && next === "/oauth/authorize?response_type=code&client_id=x&state=abc";
  console.log(`${ok ? "ok    " : "FALHOU"} ${"GET /oauth/authorize sem login → /login?next".padEnd(42)} ${res.status}${ok ? "" : "  location " + loc}`);
  if (!ok) failed++;
}
void as;
console.log(failed ? `\n${failed} falha(s)` : "\ntudo certo");
process.exit(failed ? 1 : 0);
