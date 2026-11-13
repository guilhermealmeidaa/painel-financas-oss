import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, HeartPulse, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { AnomaliesList } from "@/components/anomalies-list";
import { findAnomalies } from "@/lib/anomalies";
import { Panel } from "@/components/panel";
import { formatMonthLong, monthOf, todayISO, addMonths, addDays } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function Check({ ok, title, detail, href, cta }: { ok: boolean; title: string; detail: React.ReactNode; href?: string; cta?: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      {href && !ok && (
        <Link href={href} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          {cta ?? "Resolver"}
        </Link>
      )}
    </li>
  );
}

async function Content() {
  await connection();
  const supabase = await createClient();
  const today = todayISO();
  const month = monthOf(today);
  const next = addMonths(month, 1);
  const [{ data: semCat }, { data: accounts }, { data: manual }, { data: fees }, { data: items }, { data: pendingIncomes }, { data: recent }] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("bucket", "sem_categoria")
      .eq("superseded", false)
      .gte("occurred_on", month)
      .lt("occurred_on", next)
      .lte("occurred_on", today),
    supabase.from("accounts").select("id, name, kind, pluggy_item_id, synced_at, closing_day, due_day, days_source").order("kind").order("name"),
    supabase
      .from("transactions")
      .select("id, description, amount_cents, occurred_on")
      .eq("source", "manual")
      .is("external_id", null)
      .eq("superseded", false)
      .gte("occurred_on", addMonths(month, -1)),
    supabase.from("transactions").select("fee_cents").gt("fee_cents", 0).gte("occurred_on", month).lt("occurred_on", next),
    supabase.from("pluggy_items").select("connector_name, status, last_synced_at, consent_expires_at"),
    supabase.from("incomes").select("id").eq("source", "banco").eq("status", "auto"),
    // 30 dias + 6 meses de histórico para saber o "normal" de cada comerciante
    supabase
      .from("transactions")
      .select("id, occurred_on, description, amount_cents, account_id, bucket, is_inflow, external_id, total_installments, auto_reason")
      .eq("superseded", false)
      .gte("occurred_on", addDays(today, -215))
      .limit(10000),
  ]);
  const anomalies = findAnomalies(recent ?? [], today);
  const accNames = new Map((accounts ?? []).map((a) => [a.id, a.name.trim()]));
  const cards = (accounts ?? []).filter((a) => a.kind === "credit_card");
  const seedUnlinked = cards.filter((a) => !a.pluggy_item_id);
  const bankCards = cards.filter((a) => a.pluggy_item_id);
  const noDays = bankCards.filter((a) => !a.closing_day || !a.due_day);
  const semCatTotal = (semCat ?? []).reduce((s, t) => s + t.amount_cents, 0);
  const feeTotal = (fees ?? []).reduce((s, t) => s + (t.fee_cents ?? 0), 0);
  const name = formatMonthLong(month).split(" ")[0];

  return (
    <>
      <Panel title="Checklist" subtitle={`Quanto do painel de ${name} já está em dado real do banco`} icon={HeartPulse}>
        <ul className="divide-y divide-border">
          <Check
            ok={(semCat?.length ?? 0) <= 5}
            title={`${semCat?.length ?? 0} gastos sem categoria em ${name}`}
            detail={`${formatBRL(semCatTotal)} fora do dia a dia até você classificar (meta: no máximo 5).`}
            href="/triagem"
            cta="Triagem"
          />
          <Check
            ok={seedUnlinked.length === 0}
            title={seedUnlinked.length ? `${seedUnlinked.length} cartões seus ainda sem banco` : "Todos os cartões ligados ao banco"}
            detail={
              seedUnlinked.length
                ? `${seedUnlinked.map((a) => a.name).join(", ")}: as faturas deles ainda são estimativa. Cartões do banco disponíveis: ${bankCards.map((a) => a.name.trim()).join(", ")}.`
                : "As faturas vêm das compras reais."
            }
            href="/conexoes"
            cta="Ligar"
          />
          <Check
            ok={noDays.length === 0}
            title={noDays.length ? `${noDays.length} cartões sem dia de fechamento/vencimento` : "Fechamento e vencimento conhecidos"}
            detail={
              noDays.length
                ? `${noDays.map((a) => a.name.trim()).join(", ")}: compras caem na fatura do mês seguinte por padrão.`
                : bankCards.map((a) => `${a.name.trim()} fecha ${a.closing_day}/vence ${a.due_day}${a.days_source === "usuario" ? " (você)" : ""}`).join(" · ")
            }
            href="/conexoes"
          />
          <Check
            ok={(manual?.length ?? 0) === 0}
            title={`${manual?.length ?? 0} lançamentos seus sem par no banco`}
            detail={
              manual?.length
                ? manual.map((m) => `${m.description} (${formatBRL(m.amount_cents)})`).join(", ") + ". Dinheiro vivo ou compra planejada pode ficar assim."
                : "Tudo que você lançou já foi juntado com o banco."
            }
            href="/triagem"
            cta="Juntar"
          />
          <Check
            ok={(pendingIncomes?.length ?? 0) === 0}
            title={`${pendingIncomes?.length ?? 0} entradas do banco esperando confirmação`}
            detail="Já contam na projeção; confirme ou marque “não é entrada”."
            href="/triagem"
          />
          <Check ok title={`Taxas de Pix no crédito em ${name}: ${formatBRL(feeTotal)}`} detail={`${fees?.length ?? 0} Pix pagos com cartão no mês.`} />
        </ul>
      </Panel>

      <section id="fora-do-padrao" className="scroll-mt-24">
        <Panel title="Fora do padrão" subtitle="últimos 30 dias: valor bem acima do normal, cobrança em dobro ou primeira compra alta" icon={TriangleAlert} iconClass="bg-warning/15 text-warning">
          <AnomaliesList items={anomalies} accounts={accNames} />
        </Panel>
      </section>

      <Panel title="Último sync por conta">
        <ul className="divide-y divide-border text-sm">
          {(items ?? []).map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span>
                Banco {i + 1} <span className="text-xs text-muted-foreground">via {it.connector_name ?? "Pluggy"} · {it.status}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{it.last_synced_at ? dt.format(new Date(it.last_synced_at)) : "nunca"}</span>
            </li>
          ))}
          {(accounts ?? [])
            .filter((a) => a.pluggy_item_id)
            .map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <span className={cn("truncate", !a.synced_at && "text-warning")}>
                  {a.name.trim()} <span className="text-xs text-muted-foreground">{a.kind === "credit_card" ? "cartão" : "conta"}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{a.synced_at ? dt.format(new Date(a.synced_at)) : "nunca"}</span>
              </li>
            ))}
        </ul>
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Saúde dos dados" subtitle="O que ainda é estimativa e o que falta para o painel ficar 100% com dado real" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
