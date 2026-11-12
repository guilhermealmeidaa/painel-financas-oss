# Segurança

Este painel lida com dados bancários. As regras abaixo valem para qualquer contribuição.

## Como os dados são protegidos

- **Seu banco, seus dados.** Cada instalação usa o próprio projeto do Supabase. Nada é enviado para servidores deste projeto.
- **RLS em todas as tabelas.** Toda tabela tem `user_id` e a policy `user_id = auth.uid()`: cada usuário só enxerga as próprias linhas.
- **Segredos só no servidor.** `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` nunca levam o prefixo `NEXT_PUBLIC_` e nunca chegam ao navegador. O navegador não fala com a Pluggy.
- **Service role só onde precisa:** no sync agendado (`/api/cron/sync`, protegido pelo `CRON_SECRET`) e no MCP (`/api/mcp`, protegido por token), sempre filtrando por `user_id`.
- **Todas as páginas e rotas `/api` exigem login**, exceto `/login`, o cron (valida `CRON_SECRET`) e o MCP (exige token `pf_…`; o banco guarda só o hash).
- **MCP somente leitura.** O acesso do Claude não altera nada.
- **Nada de dados bancários nos logs.** O sync registra só contagens.
- **Modo demonstração** (`npm run demo`) só liga em desenvolvimento, usa dados inventados e bloqueia as rotas de API.

## Antes de publicar o seu fork

- Confira que o `.env.local` está fora do git (o `.gitignore` já cobre `.env*`).
- Desligue o cadastro de novos usuários no Supabase Auth.
- Se uma chave vazar, gere outra no painel do Supabase/Pluggy e atualize as variáveis.

## Reportar uma vulnerabilidade

Não abra issue pública. Use o recurso **Security → Report a vulnerability** do GitHub neste repositório, com os passos para reproduzir.
