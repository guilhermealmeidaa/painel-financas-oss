import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDownLeft, ArrowUpRight, History, PieChart } from "lucide-react";
import { MonthHeader } from "@/components/month-header";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { addMonths, formatDay, formatMonthLong, monthOf, todayISO } from "@/lib/dates";
import { monthHistory } from "@/lib/history";
import { formatBRL } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { isMonth } from "@/lib/validate";

async function Content({ month }: { month: string }) {
  await connection();
  const supabase = await createClient();
  const next = addMonths(month, 1);
  const [{ data: txs }, { data: accounts }, { data: bills }] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_on, description, amount_cents, method, is_inflow, bucket, pluggy_category, account_id, source, external_id")
      .gte("occurred_on", month)
      .lt("occurred_on", next)
      .limit(5000),
    supabase.from("accounts").select("id, name, kind"),
    supabase.from("card_bills").select("account_id, due_date, total_cents").gte("due_date", month).lt("due_date", next),
  ]);
  const acc = new Map((accounts ?? []).map((a) => [a.id, a]));
  const h = monthHistory(
    (txs ?? []).map((t) => ({ ...t, account_kind: t.account_id ? (acc.get(t.account_id)?.kind ?? null) : null })),
  );
  const maxCat = Math.max(...h.byCategory.map((c) => c.cents), 1);
  const name = formatMonthLong(month).split(" ")[0];

  if (!h.count) {
    return (
      <Panel title={`Sem dados do banco em ${name}`} icon={History}>
        <p className="text-sm text-muted-foreground">
          O banco só envia os últimos ~90 dias, e só desde que a conexão foi feita. Para planejar este mês, use{" "}
          <Link href={`/planejamento?mes=${month}`} className="text-primary hover:underline">
            Planejamento
          </Link>
          .
        </p>
      </Panel>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel title="Entrou" subtitle="na conta, sem transferências entre contas suas" icon={ArrowDownLeft} iconClass="bg-positive/10 text-positive">
          <Money cents={h.totalIn} />
          <ul className="flex flex-col gap-1 text-sm">
            {h.inflows.map((i) => (
              <li key={i.label} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">{i.label}</span>
                <span className="tabular-nums">{formatBRL(i.cents)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Saiu" subtitle="compras no cartão + débito/Pix, sem pagamento de fatura" icon={ArrowUpRight}>
          <Money cents={h.totalOut} />
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatBRL(h.onCard)} no cartão · {formatBRL(h.onAccount)} na conta
          </p>
          {(bills ?? []).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Faturas que venceram em {name}:{" "}
              {(bills ?? [])
                .map((b) => `${acc.get(b.account_id)?.name.trim() ?? "cartão"} ${formatBRL(b.total_cents)}`)
                .join(" · ")}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Para onde foi" subtitle="pela categoria que o banco deu" icon={PieChart}>
        <ul className="flex flex-col gap-2.5">
          {h.byCategory.map((c) => (
            <li key={c.label} className="flex flex-col gap-1">
              <div className="flex justify-between gap-3 text-sm">
                <span>
                  {c.label} <span className="text-xs text-muted-foreground">({c.count})</span>
                </span>
                <span className="font-medium tabular-nums">{formatBRL(c.cents)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(c.cents / maxCat) * 100}%` }} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Pix pago no cartão de crédito pode aparecer duas vezes (na conta e no cartão). A tela de Triagem ajuda a marcar a cópia.
        </p>
      </Panel>

      <Panel title="Maiores gastos do mês" icon={History}>
        <ul className="divide-y divide-border text-sm">
          {h.biggest.map((t, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDay(t.occurred_on)}</span>
              <span className="min-w-0 flex-1 truncate">{t.description}</span>
              <span className="font-medium tabular-nums">{formatBRL(t.amount_cents)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

export default async function Page(props: PageProps<"/historico">) {
  const sp = await props.searchParams;
  await connection();
  const current = monthOf(todayISO());
  const month = isMonth(sp.mes) && sp.mes <= current ? sp.mes : current;
  return (
    <>
      <MonthHeader month={month} basePath="/historico" min={addMonths(current, -6)} max={current} current={current} />
      <Suspense key={month} fallback={<div className="surface h-48 animate-pulse" />}>
        <Content month={month} />
      </Suspense>
    </>
  );
}
