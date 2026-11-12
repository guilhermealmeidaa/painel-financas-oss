# Conversar com o Claude sobre as suas finanças (MCP)

O painel expõe um servidor [MCP](https://modelcontextprotocol.io) **somente leitura** em `/api/mcp`. Com ele, o Claude consegue responder perguntas como “quanto ainda posso gastar este mês?” ou “por que a fatura de dezembro está alta?” usando os seus dados, sem conseguir mudar nada.

Ferramentas: `resumo_do_mes`, `projecao`, `transacoes`, `faturas`, `parcelas`, `contas` e `possiveis_duplicatas`.

## 1. Gerar o token

No painel, abra **Acesso do Claude**, dê um nome (ex.: “Claude Desktop”) e gere o token. Ele aparece uma vez só: copie. Na mesma tela dá para revogar.

> O MCP usa a `SUPABASE_SERVICE_ROLE_KEY` no servidor. Sem ela configurada, o endpoint responde com erro.

## 2. Conectar

Troque `https://SEU-PAINEL` pelo endereço do seu painel (ou `http://localhost:3000` com `npm run dev` rodando) e `pf_SEU_TOKEN` pelo token.

**Claude Code**

```bash
claude mcp add --transport http financas https://SEU-PAINEL/api/mcp --header "Authorization: Bearer pf_SEU_TOKEN"
```

**Claude Desktop** (`claude_desktop_config.json`), usando o [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "financas": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://SEU-PAINEL/api/mcp", "--header", "Authorization:${AUTH}"],
      "env": { "AUTH": "Bearer pf_SEU_TOKEN" }
    }
  }
}
```

Guarde o token como segredo: quem tem o token lê os seus dados financeiros. Se vazar, revogue em **Acesso do Claude** e gere outro.
