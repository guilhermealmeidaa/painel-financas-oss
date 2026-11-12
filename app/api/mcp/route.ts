import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyApiToken } from "@/lib/api-tokens";
import { registerFinanceTools } from "@/lib/mcp/tools";

/**
 * API somente leitura para o Claude (MCP, Streamable HTTP).
 * Fora do login por sessão (proxy.ts); exige `Authorization: Bearer pf_...` gerado em /acesso-claude.
 */
const handler = createMcpHandler((server) => registerFinanceTools(server), {
  serverInfo: { name: "painel-financas", version: "1.0.0" },
  instructions:
    "Dados financeiros pessoais em BRL (fuso America/Sao_Paulo), somente leitura. " +
    "Dia a dia = gastos de lazer e mercado; fixos e parcelas já estão na projeção. " +
    "Gastos do banco 'sem categoria' ficam fora das contas até serem classificados: avise quando houver muitos. " +
    "Responda em português, direto e sem julgamentos sobre as compras.",
});

const authed = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const owner = await verifyApiToken(bearerToken);
    if (!owner) return undefined;
    return { token: "redacted", clientId: owner.tokenId, scopes: ["read"], extra: { userId: owner.userId } };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
