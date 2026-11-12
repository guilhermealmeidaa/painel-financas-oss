# Painel de finanças

Um painel pessoal que junta **o seu plano** (quanto entra, os fixos e o teto do dia a dia) com **os dados reais dos seus bancos** via Open Finance ([Pluggy](https://pluggy.ai)). Ele responde três perguntas:

- **Quanto ainda dá para gastar este mês?** — teto do dia a dia dividido em duas categorias (por padrão, Lazer e Mercado; os nomes são seus).
- **Quanto vem de fatura?** — fatura de cada cartão com as compras reais, as parcelas que ainda vão cair (mesmo quando o banco não manda) e as assinaturas.
- **Como fica o saldo nos próximos meses?** — projeção mês a mês, partindo do saldo real das suas contas.

Tudo o que o painel decide sozinho (pagamento de fatura, transferência entre suas contas, IOF, regras) aparece na **Triagem** com o motivo e pode ser desfeito.

> Quer só olhar? Rode `npm install && npm run demo` e abra http://localhost:3001 — dados inventados, sem login e sem configurar nada.

## O que você precisa

- **Node.js 20+**
- Uma conta grátis no **[Supabase](https://supabase.com)** (banco de dados e login)
- Uma conta na **[Pluggy](https://dashboard.pluggy.ai)** (Open Finance) e seus bancos autorizados no **[Meu Pluggy](https://meu.pluggy.ai)**
- Opcional: **[Vercel](https://vercel.com)** para publicar e sincronizar sozinho

## Instalação

### 1. Código

```bash
git clone <este repositório> painel-financas
cd painel-financas
npm install
cp .env.example .env.local
```

### 2. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/dashboard).
2. **Crie as tabelas:** abra **SQL Editor**, cole o conteúdo de [`supabase/migrations/20260101000000_schema.sql`](supabase/migrations/20260101000000_schema.sql) e rode. (Com a [CLI do Supabase](https://supabase.com/docs/guides/cli): `supabase link` e depois `npm run db:push`.)
3. **Crie o seu usuário:** **Authentication → Users → Add user**, com e-mail e senha.
4. **Feche o cadastro:** em **Authentication → Sign In / Providers**, desligue *Allow new users to sign up*. O painel é para você; ninguém mais precisa criar conta.
5. Em **Project Settings → API**, copie para o `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (chave *publishable*)
   - `SUPABASE_SERVICE_ROLE_KEY` (chave *secret*; só servidor)

### 3. Pluggy

1. Em [dashboard.pluggy.ai](https://dashboard.pluggy.ai), crie uma **Application** e copie `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` para o `.env.local`.
2. Em [meu.pluggy.ai](https://meu.pluggy.ai), entre e autorize cada banco que você usa.
3. Gere o `CRON_SECRET` (qualquer texto longo e aleatório): `openssl rand -hex 32`.

### 4. Rodar

```bash
npm run dev
```

Abra http://localhost:3000. Se faltar alguma chave do Supabase, o painel mostra a tela **Vamos configurar** com o que falta. Com tudo certo, entre com o usuário que você criou e siga a tela **Primeiros passos**: ela mostra o que falta configurar e guia o resto (preferências, plano do mês, conectar bancos e triagem).

## Publicar na Vercel

1. Importe o repositório na Vercel.
2. Em **Settings → Environment Variables**, cadastre as mesmas variáveis do `.env.local`.
3. Faça o deploy. O [`vercel.json`](vercel.json) já agenda o sync 1 vez por dia (limite do plano grátis).
4. **Sync a cada 3 horas (opcional):** o workflow [`.github/workflows/sync.yml`](.github/workflows/sync.yml) chama o sync pelo GitHub Actions. No seu repositório, em **Settings → Secrets and variables → Actions**, crie o segredo `CRON_SECRET` (mesmo valor da Vercel) e a variável `APP_URL` (ex.: `https://meu-painel.vercel.app`).

## Como usar

| Tela | Para quê |
|---|---|
| **Visão geral** | Saldo previsto, dia a dia, cartões, contas a pagar e próximos meses |
| **Planejamento** | Entradas, fixos, teto do dia a dia e preferências (nomes das categorias, seu nome/CPF para reconhecer transferências suas) |
| **Projeção** | Saldo no fim de cada mês, com a conta aberta linha a linha |
| **Cartões** | Fatura de cada cartão: compras, parcelas e limite. Renomeie o cartão para o nome do banco (Nubank, Itaú, Inter…) e a logo aparece |
| **Parcelas** | Compras parceladas planejadas e quanto da renda já está comprometido |
| **Triagem** | O que o banco mandou sem categoria e tudo o que o painel decidiu sozinho, com o motivo |
| **Conexões** | Conectar bancos, ligar cartões do banco aos seus e sincronizar agora |
| **Acesso do Claude** | Token para um servidor MCP somente leitura (veja [`docs/mcp.md`](docs/mcp.md)) |

## Instalando com a ajuda do Claude

O repositório traz um [`CLAUDE.md`](CLAUDE.md) que explica o projeto (arquitetura, regras de negócio e de segurança) e o roteiro de instalação. Abra a pasta no [Claude Code](https://claude.com/claude-code) e peça: *"me ajude a instalar o painel"*.

## Desenvolvimento

```bash
npm run dev        # painel em http://localhost:3000
npm run demo       # modo demonstração em http://localhost:3001
npm test           # testes (Vitest)
npm run typecheck
npm run lint
npm run db:types   # regenera lib/database.types.ts a partir do seu projeto Supabase
```

Stack: Next.js (App Router), TypeScript, Tailwind + shadcn/ui, Recharts, Supabase (Postgres + Auth + RLS) e Pluggy. As regras de dinheiro ficam em `lib/` como funções puras (`projection.ts`, `invoices.ts`, `cards.ts`, `engine.ts`…), cobertas por testes.

## Segurança e privacidade

Seus dados ficam no **seu** projeto do Supabase, com RLS em todas as tabelas. Segredos (Pluggy, service role, cron) só existem no servidor. Detalhes em [`SECURITY.md`](SECURITY.md).

## Licença

[MIT](LICENSE). Logos de bancos: símbolos do [Simple Icons](https://simpleicons.org) (CC0) e marcas desenhadas como texto; as marcas pertencem aos respectivos bancos. Este projeto não é afiliado à Pluggy nem a nenhum banco.
