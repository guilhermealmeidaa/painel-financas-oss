# Segurança

Este painel lida com dados bancários. As regras abaixo valem para qualquer contribuição.

## Como os dados são protegidos

- **Seu banco, seus dados.** Cada instalação usa o próprio projeto do Supabase. Nada é enviado para servidores deste projeto.
- **RLS em todas as tabelas.** Toda tabela tem `user_id` e a policy `user_id = auth.uid()`: cada usuário só enxerga as próprias linhas.
- **Segredos só no servidor.** `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` nunca levam o prefixo `NEXT_PUBLIC_` e nunca chegam ao navegador. O navegador não fala com a Pluggy.
- **Service role só onde precisa:** no sync agendado (`/api/cron/sync`, protegido pelo `CRON_SECRET`) e no MCP (`/api/mcp`, protegido por token), sempre filtrando por `user_id`.
- **Todas as páginas e rotas `/api` exigem login**, exceto `/login`, o cron (valida `CRON_SECRET`) o MCP (exige token `pf_…` ou token OAuth; o banco guarda só hashes) e os endpoints públicos do OAuth (descoberta, registro, token e revogação).
- **MCP de leitura.** A única escrita é `lancar_gasto`, que exige escopo `write` concedido por você e só cria um gasto manual; nada é editado ou apagado.
- **OAuth do conector:** registro dinâmico só aceita os endereços de retorno do Claude (claude.ai/claude.com e loopback), PKCE S256 obrigatório, código de 60 s de uso único, refresh trocado a cada uso e preso ao cliente, revogação em Acesso do Claude, limite de chamadas por token e logs sem dados bancários.
- **Nada de dados bancários nos logs.** O sync registra só contagens.
- **Modo demonstração** (`npm run demo`) só liga em desenvolvimento, usa dados inventados e bloqueia as rotas de API.

## Antes de publicar o seu fork

- Confira que o `.env.local` está fora do git (o `.gitignore` já cobre `.env*`).
- Desligue o cadastro de novos usuários no Supabase Auth.
- Se uma chave vazar, gere outra no painel do Supabase/Pluggy e atualize as variáveis.

## Reportar uma vulnerabilidade

Não abra issue pública. Use o recurso **Security → Report a vulnerability** do GitHub neste repositório, com os passos para reproduzir.
