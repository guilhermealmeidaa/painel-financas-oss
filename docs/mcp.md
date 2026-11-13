# Conversar com o Claude sobre as suas finanças (MCP)

O painel expõe um servidor [MCP](https://modelcontextprotocol.io) em `/api/mcp`. Com ele, o Claude consegue responder perguntas como “quanto ainda posso gastar este mês?”, “cabe comprar isso em 4×?” ou “por que a fatura de dezembro está alta?” usando os seus dados. Tudo é leitura, exceto `lancar_gasto`, que só funciona se você permitir e só **cria** um gasto manual (nunca edita nem apaga).

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
- `simular_compra`: “cabe comprar X?” sem gravar nada. À vista dentro do teto do dia a dia só muda o “ainda posso gastar”; parcelado aloca as parcelas nas faturas pelo fechamento do cartão e mostra a projeção antes × depois.
- `proximos_vencimentos`: fixos e faturas não pagos dos próximos dias, se o saldo cobre cada um e se é débito automático.
- `assinaturas`: cobranças recorrentes em qualquer categoria, total mensal e quais aumentaram de preço.
- `entradas`: entradas previstas × recebidas no mês.
- `lancar_gasto` (escrita, opcional): cria um gasto manual que já aconteceu e devolve o novo “ainda posso gastar”. Aceita uma `chave` de idempotência: repetir a mesma chave não duplica.

O ritmo por fim de semana divide o que sobra pelos fins de semana que ainda contam (no mês futuro, todos), sem os marcados “sem gasto” e sem os de **períodos especiais** (ex.: uma viagem com teto próprio, cadastrada no Planejamento).

Toda resposta traz `gerado_em` (data e hora em São Paulo) e `versao` (commit e data do build no ar), para saber se o número é de agora e de qual versão do painel veio.

## Conector do claude.ai (OAuth)

Para usar no claude.ai, no app do celular ou no Claude Desktop, sem token manual:

1. No claude.ai: **Configurações → Conectores → Adicionar conector personalizado**.
2. Nome `Finanças` e URL `https://SEU-PAINEL/api/mcp`. Deixe client ID e secret em branco.
3. Clique em **Conectar**, entre no painel se ele pedir e autorize. Marque “Permitir lançar gastos” só se quiser que o Claude possa lançar.

O painel tem o próprio servidor de autorização OAuth 2.1 (PKCE S256, registro dinâmico de cliente aceitando só os endereços de retorno do Claude, token de acesso de 1 hora e refresh de 30 dias trocado a cada uso). Cada conexão aparece em **Acesso do Claude** e pode ser revogada. Para conferir os endpoints públicos depois do deploy: `npm run smoke:oauth -- https://SEU-PAINEL`.

> Opcional: defina `OAUTH_SECRET` (32+ caracteres) no servidor. Sem ela, a chave que assina os clientes é derivada da `SUPABASE_SERVICE_ROLE_KEY`; trocar essa chave obriga a reconectar o conector.

## 1. Gerar o token (Claude Code e outros clientes)

No painel, abra **Acesso do Claude**, dê um nome (ex.: “Claude Code”) e gere o token. Marque “Permitir lançar gastos” se quiser liberar o `lancar_gasto`. Ele aparece uma vez só: copie. Na mesma tela dá para revogar.

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
