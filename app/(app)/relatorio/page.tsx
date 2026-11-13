import { Suspense } from "react";
import { FileText, GitCompareArrows, ListOrdered, Scale, TriangleAlert } from "lucide-react";
import { AnomaliesList } from "@/components/anomalies-list";
import { MonthHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { ReportActions } from "@/components/report-actions";
import { findAnomalies } from "@/lib/anomalies";
import { billsForMonth } from "@/lib/bills";
import { budgetStatus } from "@/lib/budget";
import { compareCategories, deltaLabel } from "@/lib/compare";
import { invoiceInputs, loadAll, runProjection } from "@/lib/data";
import { addMonths, formatDay, formatMonthLong, lastDayOfMonth, monthOf, todayISO } from "@/lib/dates";
import { monthHistory } from "@/lib/history";
import { invoicesForMonth } from "@/lib/invoices";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { isMonth } from "@/lib/validate";

function Line({ label, planned, actual, note, invert }: { label: string; planned: number; actual: number; note?: string; invert?: boolean }) {
  // invert: para saídas, gastar MENOS que o planejado é bom
  const diff = actual - planned;
  const good = invert ? diff <= 0 : diff >= 0;
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p>{label}</p>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </div>
      <div className="shrink-0 text-right whitespace-nowrap tabular-nums">
        <p className="font-medium">{formatBRL(actual)}</p>
        <p className="text-[11px] text-muted-foreground">
          plano {formatBRL(planned)}
          {diff !== 0 && (
            <span className={cn("ml-1", good ? "text-positive" : "text-destructive")}>
              {diff > 0 ? "+" : "−"}
              {formatBRL(Math.abs(diff))}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

async function Content({ month }: { month: string }) {
  const d = await loadAll();
  const today = todayISO();
  const last = lastDayOfMonth(month);
  const closed = last < today;
  const asOf = closed ? last : today;
  const name = formatMonthLong(month);
  const prev = addMonths(month, -1);

  // plano × realizado
  const incomes = d.incomes.filter((i) => i.month === month);
  const plannedIn = incomes.filter((i) => i.source === "manual").reduce((s, i) => s + i.amount_cents, 0);
  const gotIn = incomes.filter((i) => i.source === "banco").reduce((s, i) => s + i.amount_cents, 0);
  const { bills } = billsForMonth({ ...invoiceInputs(d), month, payments: d.payments });
  const fixed = bills.filter((b) => b.kind !== "fatura");
  const fixedPlanned = fixed.reduce((s, b) => s + b.cents, 0);
  const fixedPaid = fixed.filter((b) => b.paid).reduce((s, b) => s + b.cents, 0);
  const budget = d.budgets.find((b) => b.month === month);
  const st = budget ? budgetStatus(budget, d.transactions, asOf) : null;
  const invoices = invoicesForMonth({ ...invoiceInputs(d), month });
  const row = runProjection(d).find((r) => r.month === month);

  // gastos do banco por categoria, com o mês anterior inteiro (ou até o mesmo dia, se este ainda não fechou)
  const kind = new Map(d.accounts.map((a) => [a.id, a.kind]));
  const withKind = (t: (typeof d.transactions)[number]) => ({ ...t, account_kind: t.account_id ? (kind.get(t.account_id) ?? null) : null });
  const inMonth = (t: { occurred_on: string }, m: string, until: string) => t.occurred_on >= m && t.occurred_on <= until;
  const h = monthHistory(d.transactions.filter((t) => inMonth(t, month, last)).map(withKind));
  const hNow = closed ? h : monthHistory(d.transactions.filter((t) => inMonth(t, month, asOf)).map(withKind));
  const prevUntil = closed ? lastDayOfMonth(prev) : `${prev.slice(0, 8)}${String(Math.min(Number(today.slice(8)), Number(lastDayOfMonth(prev).slice(8)))).padStart(2, "0")}`;
  const hp = monthHistory(d.transactions.filter((t) => inMonth(t, prev, prevUntil)).map(withKind));
  const deltas = hp.count ? new Map(compareCategories(hNow.byCategory, hp.byCategory).map((x) => [x.label, x])) : new Map();
  const anomalies = findAnomalies(d.transactions, asOf, Number(asOf.slice(8))).filter((a) => a.tx.occurred_on >= month);
  const accNames = new Map(d.accounts.map((a) => [a.id, a.name.trim()]));

  return (
    <>
      <Panel
        title={`Relatório de ${name}`}
        subtitle={closed ? "mês fechado" : `parcial, até ${formatDay(today)}`}
        icon={FileText}
      >
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Entrou (banco)</dt>
            <dd className="font-semibold tabular-nums text-positive">{formatBRL(h.totalIn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Saiu (banco)</dt>
            <dd className="font-semibold tabular-nums">{formatBRL(h.totalOut)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resultado do mês (projeção)</dt>
            <dd className={cn("font-semibold tabular-nums", (row?.net ?? 0) < 0 && "text-destructive")}>{row ? formatBRL(row.net) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Saldo no fim (projeção)</dt>
            <dd className="font-semibold tabular-nums">{row ? formatBRL(row.balance) : "—"}</dd>
          </div>
        </dl>
        <ReportActions month={month} />
      </Panel>

      <Panel title="Plano × realizado" subtitle="o que estava no Planejamento e o que aconteceu" icon={Scale}>
        <ul className="divide-y divide-border text-sm">
              <Line label="Entradas" planned={plannedIn} actual={gotIn} note="recebidas no banco" />
              <Line label="Fixos" planned={fixedPlanned} actual={fixedPaid} note="pagos até agora" invert />
              {st && <Line label="Dia a dia" planned={st.cap} actual={st.spent} note="teto × gasto do dia a dia" invert />}
              <Line label="Faturas que vencem no mês" planned={invoices.total} actual={bills.filter((b) => b.kind === "fatura" && b.paid).reduce((s, b) => s + b.cents, 0)} note="previstas × pagas" invert />
        </ul>
      </Panel>

      {h.byCategory.length > 0 && (
        <Panel title="Por categoria" subtitle={hp.count ? `variação contra ${formatMonthLong(prev).split(" ")[0]}${closed ? "" : " até o mesmo dia"}` : "categoria que o banco deu"} icon={GitCompareArrows}>
          <ul className="divide-y divide-border text-sm">
            {h.byCategory.map((c) => {
              const x = deltas.get(c.label);
              const lbl = x ? deltaLabel(x) : null;
              return (
                <li key={c.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {c.label} <span className="text-xs text-muted-foreground">({c.count})</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
                    {lbl && lbl !== "igual" && <span className={cn("text-[11px] tabular-nums", x!.diff > 0 ? "text-destructive" : "text-positive")}>{lbl}</span>}
                    <span className="font-medium tabular-nums">{formatBRL(c.cents)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Maiores gastos" icon={ListOrdered}>
          <ul className="divide-y divide-border text-sm">
            {h.biggest.map((t, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDay(t.occurred_on)}</span>
                <span className="min-w-0 flex-1 line-clamp-2 break-words">{t.description}</span>
                <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{formatBRL(t.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Fora do padrão no mês" icon={TriangleAlert} iconClass="bg-warning/15 text-warning">
          <AnomaliesList items={anomalies} accounts={accNames} />
        </Panel>
      </div>
    </>
  );
}

export default async function Page(props: PageProps<"/relatorio">) {
  const sp = await props.searchParams;
  const current = monthOf(todayISO());
  const month = isMonth(sp.mes) && sp.mes <= current ? sp.mes : current;
  return (
    <>
      <MonthHeader month={month} basePath="/relatorio" min={addMonths(current, -6)} max={current} current={current} />
      <Suspense key={month} fallback={<div className="surface h-96 animate-pulse" />}>
        <Content month={month} />
      </Suspense>
    </>
  );
}
