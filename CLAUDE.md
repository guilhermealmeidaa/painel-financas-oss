@AGENTS.md

# Painel de finanças — guia para o Claude

Painel pessoal de finanças em pt-BR. Junta **o plano** que a pessoa cadastra (entradas, fixos, teto do dia a dia) com **os dados reais dos bancos** via Open Finance (Pluggy) e responde: quanto ainda dá para gastar no mês, quanto vem de fatura e como fica o saldo nos próximos meses. Uma instalação = um projeto Supabase de uma pessoa.

Fale com o usuário em **português**, direto, com números. Interface, comentários e mensagens de commit também em português.

## Comandos

```bash
npm run dev        # http://localhost:3000 (precisa de .env.local; sem Supabase, abre /configurar)
npm run demo       # http://localhost:3001, dados inventados, sem login nem banco (bom para testar visual)
npm test           # Vitest (tests/**/*.test.ts)
npm run typecheck  # next typegen + tsc (PageProps/LayoutProps são gerados pelo Next)
npm run lint
npm run db:push    # aplica supabase/migrations no projeto ligado (supabase link)
npm run db:types   # regenera lib/database.types.ts
```

Antes de dizer que terminou: `npm test`, `npm run typecheck` e `npm run lint` limpos. Mudou tela? Confira no navegador (o `npm run demo` serve para isso).

## Stack e peculiaridades

- **Next.js 16** (App Router). Leia o `AGENTS.md`: a API mudou. Em especial:
  - O middleware chama **`proxy.ts`** (protege tudo, exceto `/login`, `/configurar` sem Supabase, `/api/cron` com `CRON_SECRET`, `/api/mcp` com token e os endpoints públicos do OAuth: `/.well-known/*`, `/oauth/register`, `/oauth/token`, `/oauth/revoke`; o `/oauth/authorize` exige login e volta para ele depois).
  - **Cache Components ligado**: página que lê dados por request precisa de `await connection()` e de `<Suspense>` em volta, senão o build quebra.
- **Supabase**: Postgres + Auth + RLS. Clientes em `lib/supabase/` (`server.ts` com a sessão; `admin.ts` com service role, **só** em cron e MCP).
- **Tailwind v4 + shadcn (base-nova)**. Cards usam o utilitário **`surface`** (`app/globals.css`); valores em reais usam `<Money>`; card com título usa `<Panel>`.
- **Recharts** para gráficos; **Vitest** para testes.

## Mapa do código

```
app/(app)/            telas com login: / (visão geral), planejamento, projecao, faturas (cartões), parcelas,
                      historico, assinaturas, triagem, conexoes, acesso-claude, saude-dos-dados, primeiros-passos
app/configurar/       instalação (pública só enquanto o Supabase não está configurado)
app/api/              rotas: bills, budgets, fixed, incomes, transactions, rules, settings, accounts,
                      pluggy (token/sync/items), cron/sync (Pluggy agendado), mcp (leitura + lancar_gasto com escopo write), tokens, budget-periods, oauth-grants; `app/oauth/*` e `app/.well-known/*` = servidor OAuth 2.1 do conector
components/home/      cards da visão geral; components/plan/ editores do planejamento; components/pluggy/
lib/                  regras de negócio — quase tudo função pura e testada
supabase/migrations/  schema completo (uma migração inicial)
tests/                testes das regras de lib/ (fixtures fictícias)
```

Módulos de `lib/` que mais importam:

| Arquivo | O que faz |
|---|---|
| `projection.ts` | `project()`: saldo mês a mês. **`countsInDaily()` é a fonte única do que conta no dia a dia** (buckets `lazer`/`mercado`, do início do controle até hoje). `dailySplit` divide crédito × débito/Pix. |
| `data.ts` | `loadAll()` carrega tudo do usuário; `runProjection()` monta a projeção "real primeiro" (faturas reais por mês, mês atual ancorado no saldo do banco). |
| `invoices.ts` | `invoicesForMonth()`: fatura de cada cartão. Cartão ligado ao banco usa compras reais + parcelas futuras (do banco ou calculadas) + assinaturas projetadas. Pseudo-cartões: `"plano"` (parcela planejada sem par no banco) e `"reserva"` (o que falta do teto no crédito). |
| `cards.ts` | Dias de fechamento/vencimento, mês de fatura, agrupamento de compras parceladas (`purchaseKey`, `groupPurchases`), parcelas calculadas (`synthesizeInstallments`), antecipação, fatura paga, compras do plano já cobertas pelo banco. |
| `bills.ts` | Contas a pagar do mês. Fatura que o banco marcou como paga conta como paga, qualquer que seja o cartão ligado; desmarcar à mão vale mais. |
| `anchor.ts` | Âncora do mês atual: saldo real + o que ainda entra − o que ainda falta pagar. |
| `engine.ts` / `engine-writer.ts` | Motor de decisões automáticas (pagamento de fatura, transferência própria, IOF, regras, categoria do banco, entradas). Grava `auto_reason` e `prev_bucket`. |
| `merge.ts` / `duplicates.ts` | Juntar lançamento manual com compras do banco (1 × N, não destrutivo) e achar duplicados. |
| `pluggy/` | Cliente da API, mapeamento de categorias (`map.ts`) e sync (`sync.ts`). |
| `banks.ts` | Bancos reconhecidos pelo nome do cartão: cor e logo (`bank-icons.ts` vem do Simple Icons). |
| `labels.ts` | Rótulos; `bucketLabels(settings)` aplica os nomes que o usuário deu ao lazer/mercado. |
| `onboarding.ts` / `setup-status.ts` | Etapas da configuração e quais variáveis de ambiente faltam (só booleanos). |
| `demo-data.ts` / `demo-flag.ts` | Modo demonstração. |
| `mcp/tools.ts` | Ferramentas do MCP (`resumo_do_mes`, `projecao`, `transacoes`, `faturas`, `parcelas`, `contas`, `possiveis_duplicatas`, diagnóstico `saude`/`detalhe_fatura`/`detalhe_dia_a_dia`, `simular_compra`, `proximos_vencimentos`, `assinaturas`, `entradas` e a única de escrita, `lancar_gasto`). Toda resposta traz `gerado_em` e `versao`. |
| `schedule.ts`, `debt.ts`, `compare.ts`, `anomalies.ts` | Agenda do mês (Calendário e `proximos_vencimentos`), dívidas do Plano, comparativo por categoria e gastos fora do padrão. Só leem dados. |
| `alerts.ts`, `push.ts`, `notify-run.ts` | Alertas por push (cada um uma vez só, via `notification_log`), resumo das 21h e as fotos do mês (`month_snapshots`) que alimentam o planejado × realizado. Rodam no cron. |
| `oauth.ts`, `oauth-authorize.ts`, `mcp-auth.ts` | Servidor OAuth 2.1 do conector do claude.ai (DCR sem estado, PKCE S256, tokens só como hash) e autenticação do `/api/mcp` (token `pf_` ou OAuth, limite de 120 chamadas/min). |
| `mcp/views.ts` | Montagem das respostas de diagnóstico (puro e testado). Nada é recalculado aqui: os detalhes saem das mesmas funções que geram os totais (`invoicesForMonth`, `dailyTransactions`, `monthStatus`), por isso batem centavo a centavo. |

## Conceitos do domínio

- **Dinheiro em centavos** (`*_cents`, inteiro). **Datas** como string ISO `AAAA-MM-DD`; **mês** como `AAAA-MM-01`. Fuso: America/Sao_Paulo.
- **Bucket** de cada transação: `lazer`, `mercado` (as duas do dia a dia, nomes editáveis em `settings.label_*`), `fixo`, `assinatura`, `parcela`, `ignorar`, `sem_categoria`.
- **Dia a dia**: teto mensal (`monthly_budgets`) dividido entre lazer e mercado (`budget_allocations`), no crédito ou no débito/Pix.
- **Fixos** (`fixed_expenses`): conta, empréstimo, veículo, cartão (parcelas antigas). `match_pattern` marca como pago quando a saída aparece no banco.
- **Modo banco**: com algum cartão ligado à Pluggy, a fatura usa só dado real; cartões cadastrados e não ligados viram alerta, nunca estimativa somada ao real.
- A Pluggy às vezes manda o **"total" da fatura como saldo a pagar** (depois dos pagamentos), e alguns bancos **não mandam parcelas futuras**: por isso existem as parcelas calculadas e a soma das compras ligadas à fatura.

## Regras que não se quebram

1. **Segredos só no servidor.** `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` nunca com prefixo `NEXT_PUBLIC_`. O navegador nunca chama a Pluggy.
2. **RLS em toda tabela**, toda tabela com `user_id` e policy `user_id = auth.uid()`. Com service role, **sempre** filtre por `user_id`.
3. **Nunca logue tokens nem dados bancários** (descrições, valores, contas). Logs de sync só com contagens.
4. **Schema: mostre o plano antes e não apague dados.** Migrações aditivas; mudança de tipo/coluna com caminho de volta.
5. **Tudo que o painel decide sozinho fica visível e reversível na Triagem**, com o motivo (`auto_reason`, `prev_bucket`). Decisão do usuário (`user_locked`) não é sobrescrita pelo motor.
6. **MCP é leitura, com uma exceção controlada:** `lancar_gasto` só funciona com escopo `write` (token ou conexão OAuth autorizada com “Permitir lançar gastos”) e só **cria** um gasto manual, com chave de idempotência. Nenhuma ferramenta edita ou apaga.
7. Lógica de dinheiro nova vai para `lib/` como função pura **com teste**.

## Adaptar às necessidades de cada pessoa

O projeto foi feito para ser **personalizado**. Cada pessoa organiza o dinheiro de um jeito, e é esperado que ela peça mudanças grandes: novas categorias, metas, divisão de contas com outra pessoa, telas novas, remover o que não usa. Ao receber um pedido assim:

- **Apoie e proponha.** Entenda a necessidade real (pergunte como a pessoa organiza o dinheiro hoje) e sugira o jeito mais simples de encaixar no painel. Não trate o desenho atual como intocável.
- **Reaproveite a base**: categorias novas entram no enum `bucket` (com migração aditiva e rótulo em `lib/labels.ts`); regras de dinheiro em `lib/` como função pura com teste; telas com `Panel`, `Money` e o utilitário `surface`.
- **Mantenha as regras que não se quebram** (seção acima): segredos no servidor, RLS, nada de dados bancários em log, decisões automáticas reversíveis. Personalizar nunca justifica abrir mão delas.
- **Explique o efeito nos números**: se a mudança altera o dia a dia, as faturas ou a projeção, diga o que muda e confira com dados reais ou com o `npm run demo`.
- Melhoria que serve para qualquer pessoa (bug, banco novo, tela mais clara): sugira abrir um pull request no repositório original.

## Onboarding: ajudando alguém a instalar

O caminho que o próprio app mostra (`/configurar` antes do Supabase, depois `/primeiros-passos`):

1. **Supabase**: criar projeto; rodar `supabase/migrations/20260101000000_schema.sql` no SQL Editor (ou `supabase link` + `npm run db:push`); criar o usuário em Authentication → Users; desligar novos cadastros.
2. **Pluggy**: criar Application em dashboard.pluggy.ai (Client ID/Secret); autorizar os bancos em meu.pluggy.ai.
3. **`.env.local`**: `cp .env.example .env.local` e preencher. Reiniciar o `npm run dev`.
4. **No app** (Primeiros passos): preferências → plano do mês (Planejamento) → Conexões → "Conectar com Meu Pluggy" → Triagem.
5. **Publicar** (opcional): Vercel com as mesmas variáveis (o `vercel.json` já agenda o sync diário). Sync a cada 3 h: segredo `CRON_SECRET` e variável `APP_URL` no GitHub Actions (`.github/workflows/sync.yml`).

Problemas comuns:

- **Página só mostra "Vamos configurar"**: faltam `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`, ou o dev não foi reiniciado.
- **Login falha**: o usuário não foi criado no Supabase Auth, ou o schema não foi aplicado.
- **Conexões diz que falta chave**: `PLUGGY_CLIENT_ID`/`SECRET` ausentes no servidor (na Vercel, cadastrar e fazer redeploy).
- **Cartões com nome de produto** ("Platinum", "Gold"): renomear para o banco (logo e cor aparecem) ou usar "É o meu…" para juntar com um cartão cadastrado.
- **Fatura estranha**: comparar com o app do banco; ver parcelas calculadas e a linha "reserva" em Cartões; investigar com o MCP (`faturas`, `transacoes`).
- **`npm run typecheck` reclama de `PageProps`**: o script já roda `next typegen`; rodando `tsc` direto, gere os tipos antes.

Nunca peça para o usuário colar segredos no chat; peça para colocar no `.env.local` ou nas variáveis da Vercel.
