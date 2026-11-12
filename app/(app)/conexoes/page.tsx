import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, Landmark, Link2 } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { AccountRow } from "@/components/pluggy/account-row";
import { CardDays, CardLinker } from "@/components/pluggy/card-linker";
import { ConnectPanel, ReauthButton, RemoveItemButton } from "@/components/pluggy/connect-panel";
import { formatBRL } from "@/lib/money";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { serverSetup } from "@/lib/setup-status";
import { createClient } from "@/lib/supabase/server";

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const d = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

async function ConexoesContent() {
  await connection();
  const supabase = await createClient();
  const [{ data: items }, { data: accounts }, { data: txAccounts }] = await Promise.all([
    supabase.from("pluggy_items").select("*").order("created_at"),
    supabase
      .from("accounts")
      .select("id, name, kind, pluggy_item_id, balance_cents, available_limit_cents, credit_limit_cents, bill_due_date, closing_day, due_day, days_source")
      .order("name"),
    supabase.from("transactions").select("account_id").not("account_id", "is", null).limit(10000),
  ]);
  // últimas compras de cada cartão do banco, para você reconhecer qual é qual
  const { data: recentTx } = await supabase
    .from("transactions")
    .select("account_id, occurred_on, description, amount_cents")
    .eq("method", "credito")
    .eq("is_inflow", false)
    .lte("occurred_on", new Date().toISOString().slice(0, 10))
    .not("account_id", "is", null)
    .order("occurred_on", { ascending: false })
    .limit(400);
  const all = accounts ?? [];
  const txCount = new Map<string, number>();
  for (const t of txAccounts ?? []) txCount.set(t.account_id!, (txCount.get(t.account_id!) ?? 0) + 1);
  // contas que você cadastrou e ainda não estão ligadas a nenhum banco (ex.: Nubank, Inter do seed)
  const unlinked = all.filter((a) => !a.pluggy_item_id);

  const info = (a: (typeof all)[number]) => {
    if (a.kind === "credit_card" && a.available_limit_cents != null && a.credit_limit_cents)
      return `livre ${formatBRL(a.available_limit_cents)} de ${formatBRL(a.credit_limit_cents)}`;
    if (a.kind === "checking" && a.balance_cents != null) return `saldo ${formatBRL(a.balance_cents)}`;
    return "";
  };

  return (
    <>
      <Panel title="Conectar bancos" icon={Landmark}>
        {!pluggyConfigured() ? (
          <div className="flex flex-col gap-2 rounded-[14px] bg-warning/12 p-4 text-[13px] ring-1 ring-warning/30">
            <p className="font-semibold">Falta configurar no servidor:</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {serverSetup()
                .missingRequired.map((i) => (
                  <li key={i.key}>
                    <code className="text-foreground">{i.key}</code> ({i.label})
                  </li>
                ))}
            </ul>
            <p className="text-muted-foreground">
              Coloque as chaves no <code>.env.local</code> (ou nas variáveis da Vercel) e reinicie. O passo a passo está em{" "}
              <a href="/primeiros-passos" className="font-medium text-primary hover:underline">Primeiros passos</a>.
            </p>
          </div>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Conecte seus bancos em <span className="text-foreground">meu.pluggy.ai</span> (cada banco é autorizado lá).
              </li>
              <li>
                Aqui, toque em <span className="text-foreground">Conectar com Meu Pluggy</span> e entre com a conta da Meu Pluggy.
              </li>
              <li>Cada banco vira um item. O sync roda sozinho todo dia; dá pra forçar no botão.</li>
            </ol>
            <ConnectPanel hasItems={(items?.length ?? 0) > 0} />
          </>
        )}
      </Panel>

      {(items?.length ?? 0) > 0 && unlinked.some((u) => u.kind === "credit_card") && (
        <Panel
          title="Ligue os cartões"
          subtitle="Depois de ligado, a estimativa daquele cartão some e passa a valer o que o banco mostra"
          icon={Link2}
          iconClass="bg-warning/15 text-warning"
        >
          <CardLinker
            bankCards={all
              .filter((a) => a.kind === "credit_card" && a.pluggy_item_id)
              .map((a) => ({
                id: a.id,
                name: a.name,
                limit: a.credit_limit_cents,
                available: a.available_limit_cents,
                closing_day: a.closing_day,
                due_day: a.due_day,
                days_source: a.days_source,
                recent: (recentTx ?? []).filter((t) => t.account_id === a.id).slice(0, 3),
              }))}
            targets={unlinked.filter((u) => u.kind === "credit_card").map(({ id, name }) => ({ id, name }))}
          />
          <p className="text-sm text-muted-foreground">
            Pela Meu Pluggy o nome do banco não vem junto: os cartões chegam com o nome do produto (“platinum”, “gold” etc.). Em cada um, use{" "}
            <b className="text-foreground">É o meu…</b> para dizer qual dos seus cartões ele é (
            {unlinked
              .filter((u) => u.kind === "credit_card")
              .map((u) => u.name)
              .join(", ")}
            ). Assim as parcelas antigas do plano e as faturas reais ficam no mesmo cartão.
          </p>
        </Panel>
      )}

      {(items ?? []).map((it, idx) => {
        const accs = all.filter((a) => a.pluggy_item_id === it.item_id);
        const ok = it.status === "UPDATED" || it.status === "UPDATING";
        const summary = it.last_sync_summary as { error?: string } | null;
        return (
          <Panel
            key={it.id}
            title={`Banco ${idx + 1}`}
            subtitle={<span className="font-mono">{it.item_id.slice(0, 8)}… · via {it.connector_name ?? "Pluggy"}</span>}
            action={
              <div className="flex items-center gap-3">
                <ReauthButton itemId={it.item_id} />
                <RemoveItemButton id={it.id} />
              </div>
            }
          >
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className={ok ? "flex items-center gap-1 text-positive" : "flex items-center gap-1 text-warning"}>
                {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />} {it.status ?? "?"}
              </span>
              <span className="text-muted-foreground">Último sync: {it.last_synced_at ? dt.format(new Date(it.last_synced_at)) : "nunca"}</span>
              {it.consent_expires_at && (
                <span className="text-muted-foreground">Autorização até {d.format(new Date(it.consent_expires_at))}</span>
              )}
            </div>
            {summary?.error && <p className="text-sm text-destructive">{summary.error}</p>}
            {accs.length > 0 && (
              <ul className="divide-y divide-border rounded-2xl bg-muted/60 px-3">
                {accs.map((a) => (
                  <AccountRow
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    kind={a.kind}
                    info={info(a)}
                    txCount={txCount.get(a.id) ?? 0}
                    targets={unlinked.filter((u) => u.kind === a.kind).map(({ id, name }) => ({ id, name }))}
                  >
                    {a.kind === "credit_card" && <CardDays id={a.id} closing={a.closing_day} due={a.due_day} source={a.days_source} />}
                  </AccountRow>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Conexões" subtitle="Open Finance pela Meu Pluggy (uso pessoal, atualiza 1x por dia)" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <ConexoesContent />
      </Suspense>
    </>
  );
}
