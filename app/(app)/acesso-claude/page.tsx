import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Bot, Plug, ShieldCheck, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { OAuthGrants } from "@/components/oauth-grants";
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
  ["saude / detalhe_fatura / detalhe_dia_a_dia", "diagnóstico e o que compõe cada número"],
  ["simular_compra / proximos_vencimentos", "'cabe comprar?' e contas da semana, sem gravar nada"],
  ["assinaturas / entradas", "cobranças recorrentes e salário recebido × previsto"],
];

async function Content() {
  await connection();
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const mcpUrl = `${base}/api/mcp`;
  const [{ data: tokens }, { data: grants }] = await Promise.all([
    supabase.from("api_tokens").select("id, name, prefix, created_at, last_used_at, revoked_at, scopes").order("created_at", { ascending: false }),
    supabase.from("oauth_grants").select("id, client_name, redirect_host, scopes, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }).limit(30),
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

      <Panel title="Atalhos do iPhone (Siri)" subtitle="pergunte o saldo e lance gastos por voz ou por um widget" icon={Smartphone}>
        <p className="text-sm text-muted-foreground">
          Gere acima um token chamado &quot;Atalhos iPhone&quot; com <strong>Permitir lançar gastos</strong> marcado. Depois, no app <strong>Atalhos</strong>:
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="font-medium">Quanto posso gastar</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Novo atalho → ação <strong>Obter conteúdo do URL</strong>.</li>
              <li>
                URL <code className="rounded bg-card px-1 py-0.5 text-xs break-all">{base}/api/atalhos/resumo</code>
              </li>
              <li>
                Em Cabeçalhos: <code className="text-xs">Authorization</code> = <code className="text-xs">Bearer pf_SEU_TOKEN</code>.
              </li>
              <li>Ação <strong>Falar texto</strong> (ou Mostrar resultado) com o conteúdo do URL.</li>
            </ol>
          </div>
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="font-medium">Lançar gasto</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong>Pedir entrada</strong> (Número): &quot;Quanto?&quot; · <strong>Pedir entrada</strong> (Texto): &quot;Com o quê?&quot;
              </li>
              <li>
                <strong>Obter conteúdo do URL</strong>: <code className="rounded bg-card px-1 py-0.5 text-xs break-all">{base}/api/atalhos/gasto</code>, método{" "}
                <strong>POST</strong>, mesmo cabeçalho Authorization.
              </li>
              <li>
                Corpo da solicitação <strong>JSON</strong>: <code className="text-xs">valor</code> = 1ª resposta, <code className="text-xs">descricao</code> = 2ª resposta.
                Opcional: <code className="text-xs">categoria</code> (lazer, mercado, fixo, assinatura — ou os nomes que você deu) e <code className="text-xs">meio</code> (credito, debito, pix).
              </li>
              <li>
                <strong>Falar texto</strong> com o resultado (&quot;Lançado: R$ 30,00 de almoço… Ainda dá para gastar…&quot;).
              </li>
            </ol>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Dê aos atalhos os nomes que quer falar (&quot;E aí Siri, quanto posso gastar&quot;). Para o widget: segure a tela de início → + → Atalhos. O lançamento é
          igual ao &quot;+ Gasto&quot;: entra como manual hoje e se junta sozinho com a compra quando ela vier do banco.
        </p>
      </Panel>

      <Panel title="Conector do claude.ai" subtitle={<span className="font-mono">{mcpUrl}</span>} icon={Plug}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>No claude.ai: Configurações → Conectores → Adicionar conector personalizado.</li>
          <li>
            Nome <strong>Finanças</strong> e URL <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{mcpUrl}</code>. Deixe client ID e secret em branco.
          </li>
          <li>Clique em Conectar, entre aqui se pedir e autorize (marque &quot;Permitir lançar gastos&quot; só se quiser).</li>
        </ol>
        <p className="text-xs text-muted-foreground">Vale para o claude.ai, o app do celular e o Claude Desktop. Cada conexão aparece abaixo e pode ser revogada.</p>
        <OAuthGrants grants={grants ?? []} />
      </Panel>

      <Panel title="O que o Claude consegue ver" subtitle="Leitura: nada é alterado ou apagado" icon={ShieldCheck} iconClass="bg-positive/10 text-positive">
        <ul className="flex flex-col gap-1.5 text-sm">
          {TOOLS.map(([name, desc]) => (
            <li key={name}>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{name}</code> <span className="text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">lancar_gasto</code>{" "}
          <span className="text-muted-foreground">
            só com token que permite lançar gastos: cria um gasto manual (com chave contra duplicidade) e devolve o novo &quot;ainda posso gastar&quot;.
            Nunca edita nem apaga.
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Tokens de acesso duram 1 hora e são renovados sozinhos; revogar a conexão corta na hora. Revogue um token pf_ se ele vazar.
        </p>
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Acesso do Claude" subtitle="API (MCP) para o Claude consultar suas finanças e, se você permitir, lançar gastos" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
