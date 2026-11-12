import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Bot, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { TokenManager } from "@/components/token-manager";
import { createClient } from "@/lib/supabase/server";

const TOOLS = [
  ["resumo_do_mes", "saldo previsto, dia a dia, ritmo e contas a pagar de um mês"],
  ["projecao", "saldo mês a mês com alertas"],
  ["transacoes", "gastos filtrando por período, bucket e descrição"],
  ["faturas", "fatura de cada cartão (prevista ou real) e limite"],
  ["parcelas", "compras parceladas e o comprometido em 12 meses"],
  ["contas", "contas e cartões com saldo e limite"],
  ["possiveis_duplicatas", "pares de gastos que parecem repetidos, com o motivo"],
];

async function Content() {
  await connection();
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/api/mcp`;
  const [{ data: tokens }] = await Promise.all([
    supabase.from("api_tokens").select("id, name, prefix, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }),
  ]);
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <Panel title="Tokens de acesso" subtitle={<span className="font-mono">{mcpUrl}</span>} icon={Bot}>
        {!hasServiceRole && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            Falta SUPABASE_SERVICE_ROLE_KEY no servidor: a API recusa todas as chamadas até ela ser configurada.
          </p>
        )}
        <TokenManager tokens={tokens ?? []} mcpUrl={mcpUrl} />
      </Panel>

      <Panel title="O que o Claude consegue ver" subtitle="Somente leitura: nada é criado, alterado ou apagado" icon={ShieldCheck} iconClass="bg-positive/10 text-positive">
        <ul className="flex flex-col gap-1.5 text-sm">
          {TOOLS.map(([name, desc]) => (
            <li key={name}>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{name}</code> <span className="text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          O app do Claude (claude.ai/celular) precisa de login OAuth: fica para depois do deploy. Revogue um token se ele vazar.
        </p>
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Acesso do Claude" subtitle="API somente leitura (MCP) para fazer perguntas sobre suas finanças" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
