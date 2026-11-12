# Conversar com o Claude sobre as suas finanças (MCP)

O painel expõe um servidor [MCP](https://modelcontextprotocol.io) **somente leitura** em `/api/mcp`. Com ele, o Claude consegue responder perguntas como “quanto ainda posso gastar este mês?” ou “por que a fatura de dezembro está alta?” usando os seus dados, sem conseguir mudar nada.

Ferramentas:

- `resumo_do_mes`: visão geral do mês (saldo previsto, fatura, parcelas, dia a dia e contas a pagar). Para “como fecha o mês?” e “quanto ainda posso gastar?”.
- `projecao`: saldo mês a mês nos próximos meses. Para “como fica o saldo daqui a um ano?”.
- `transacoes`: lançamentos com filtros. Para achar um gasto específico.
- `faturas`: faturas de cada cartão no mês. Para “quanto vence em cada cartão?”.
- `parcelas`: parcelas do plano e as que já estão nos cartões. Para “quanto de parcela ainda vou pagar?”.
- `contas`: contas e cartões cadastrados, com saldo, limites e datas. Para “quais contas estão ligadas ao banco?”.
- `possiveis_duplicatas`: lançamentos que parecem repetidos. Para limpar a triagem.
- `saude`: diagnóstico dos dados (último sync de cada conta, gastos sem categoria, parcelas do plano sem par no banco, lançamentos manuais sem a transação do banco e faturas pagas cujo valor reconstruído não bate). Use primeiro quando um número parecer estranho.
- `detalhe_fatura`: abre a fatura de um cartão linha por linha, com id, data e parcela de cada item. Para “de onde vem esse valor da fatura?”. Os itens somam exatamente cada linha.
- `detalhe_dia_a_dia`: lista todas as transações que entram no dia a dia (lazer/mercado) do mês. O total bate centavo a centavo com o `resumo_do_mes`. Para “achar um gasto que não deveria contar?”.

Toda resposta traz `gerado_em` (data e hora em São Paulo) e `versao` (commit e data do build no ar), para saber se o número é de agora e de qual versão do painel veio.

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
