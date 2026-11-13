-- Nome do cartão/conta como a Pluggy manda (ex.: "GOLD", "PLATINUM"), preservado mesmo depois de
-- você renomear ou ligar o cartão. Serve de apelido nas buscas (MCP: faturas, detalhe_fatura).
-- Aditivo: o sync preenche a cada execução; o nome que você deu (accounts.name) não muda.
alter table public.accounts add column if not exists pluggy_name text;
comment on column public.accounts.pluggy_name is 'Nome original na Pluggy (marketingName ou name); apelido para buscas.';
