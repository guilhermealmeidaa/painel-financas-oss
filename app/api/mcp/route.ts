import { createMcpHandler } from "mcp-handler";
import { authenticate, logId, withinRateLimit } from "@/lib/mcp-auth";
import { registerFinanceTools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/oauth";

/**
 * API do Claude (MCP, Streamable HTTP): leitura; escrita só em lancar_gasto e só com escopo "write".
 * Fora do login por sessão (proxy.ts). Aceita o Bearer `pf_…` gerado em /acesso-claude ou o token OAuth
 * do conector do claude.ai (descoberta em /.well-known/oauth-protected-resource).
 */
const handler = createMcpHandler((server) => registerFinanceTools(server), {
  serverInfo: { name: "painel-financas", version: "1.0.0" },
  instructions:
    "Dados financeiros pessoais em BRL (fuso America/Sao_Paulo). Tudo é leitura, exceto lancar_gasto: use só quando o usuário pedir para lançar um gasto. " +
    "Dia a dia = gastos de lazer e mercado; fixos e parcelas já estão na projeção. " +
    "Gastos do banco 'sem categoria' ficam fora das contas até serem classificados: avise quando houver muitos. " +
    "Responda em português, direto e sem julgamentos sobre as compras.",
});

async function route(req: Request): Promise<Response> {
  const started = Date.now();
  const origin = originOf(req);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : undefined;
  const caller = await authenticate(bearer, origin);
  if (!caller) {
    return new Response(JSON.stringify({ error: "invalid_token", error_description: bearer ? "Token inválido, expirado ou revogado" : "Token obrigatório" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer${bearer ? ' error="invalid_token",' : ""} resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp", scope="read"`,
      },
    });
  }
  if (!(await withinRateLimit(caller))) {
    console.warn(JSON.stringify({ evt: "mcp_rate_limited", who: logId(caller) }));
    return new Response(JSON.stringify({ error: "rate_limited", error_description: "Muitas chamadas: tente de novo em 1 minuto" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    });
  }
  // só o nome do método/ferramenta vai para o log (nunca argumentos nem respostas)
  const rpc = req.method === "POST" ? ((await req.clone().json().catch(() => null)) as { method?: string; params?: { name?: string } } | null) : null;
  (req as Request & { auth?: unknown }).auth = { token: "redacted", clientId: caller.key, scopes: caller.scopes, extra: { userId: caller.userId } };
  const res = await handler(req);
  console.info(JSON.stringify({ evt: "mcp", who: logId(caller), method: rpc?.method ?? req.method, tool: rpc?.params?.name, status: res.status, ms: Date.now() - started }));
  return res;
}

export { route as GET, route as POST, route as DELETE };
