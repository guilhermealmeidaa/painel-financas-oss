import Link from "next/link";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo-flag";
import { Inbox, Receipt } from "lucide-react";
import { CartoesCard } from "@/components/home/cartoes-card";
import { ContasCard } from "@/components/home/contas-card";
import { DiaADiaCard } from "@/components/home/dia-a-dia-card";
import { ParcelasCard, type CommitItem } from "@/components/home/parcelas-card";
import { ProjecaoStrip } from "@/components/home/projecao-strip";
import { SaldoCard } from "@/components/home/saldo-card";
import { MonthHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { billsForMonth } from "@/lib/bills";
import { monthStatus, remainingWeekends } from "@/lib/budget";
import { invoiceInputs, loadAll, runProjection, type AllData } from "@/lib/data";
import { addMonths, formatMonthLong, monthOf, todayISO } from "@/lib/dates";
import { invoicesForMonth } from "@/lib/invoices";
import { installmentAmountInMonth } from "@/lib/projection";
import { bucketLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";

function invoiceFor(data: AllData, month: string) {
  return invoicesForMonth({ ...invoiceInputs(data), month });
}

export default async function HomePage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const data = await loadAll();
  if (!data.settings && !DEMO) redirect("/primeiros-passos");
  const today = todayISO();
  const current = monthOf(today);
  const rows = runProjection(data);
  const first = rows[0]?.month ?? current;
  const last = rows.at(-1)?.month ?? current;

  const asked = typeof sp.mes === "string" && /^\d{4}-\d{2}-01$/.test(sp.mes) ? sp.mes : current;
  const month = asked < first ? first : asked > last ? last : asked;
  const isCurrent = month === current;
  const rowIdx = rows.findIndex((r) => r.month === month);
  const row = rows[rowIdx];
  const prevBalance = rowIdx > 0 ? rows[rowIdx - 1].balance : (data.settings?.opening_balance_cents ?? 0);

  const budget = data.budgets.find((b) => b.month === month);
  const status = budget
    ? monthStatus({
        today,
        month,
        controlStart: budget.control_start,
        capCents: budget.cap_cents,
        allocations: budget.allocations,
        transactions: data.transactions,
        skippedWeekends: budget.skipped_weekends,
      })
    : null;

  const { bills } = billsForMonth({ ...invoiceInputs(data), month, payments: data.payments });

  // Cartões: primeira fatura a partir do mês escolhido + as duas seguintes
  const invMonth = [0, 1, 2, 3].map((n) => addMonths(month, n)).find((m) => invoiceFor(data, m).total > 0) ?? month;
  const inv = invoiceFor(data, invMonth);
  const upcoming = [0, 1, 2].map((n) => {
    const m = addMonths(invMonth, n);
    return { month: m, total: invoiceFor(data, m).total };
  });

  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const commit: CommitItem[] = [
    ...data.fixed
      .filter((f) => f.month === month && f.category !== "conta" && f.amount_cents > 0)
      .map((f) => ({
        name: f.category === "cartao" ? `${accountName.get(f.account_id ?? "") ?? f.name} (antigas)` : f.name,
        cents: f.amount_cents,
        kind: f.category as CommitItem["kind"],
      })),
    ...data.installments
      .filter((p) => p.status === "ativa")
      .map((p) => ({ name: p.name, cents: installmentAmountInMonth(p, month), kind: "parcela" as const }))
      .filter((p) => p.cents > 0),
  ].sort((a, b) => b.cents - a.cents);

  const monthTx = data.transactions.filter(
    (t) => monthOf(t.occurred_on) === month && (t.bucket === "lazer" || t.bucket === "mercado" || t.bucket === "sem_categoria"),
  );
  const pending = data.transactions.filter((t) => monthOf(t.occurred_on) === month && t.bucket === "sem_categoria");
  const pendingTotal = pending.reduce((s, t) => s + t.amount_cents, 0);
  const feeTx = data.transactions.filter((t) => monthOf(t.occurred_on) === month && (t.fee_cents ?? 0) > 0);
  const feeTotal = feeTx.reduce((s, t) => s + (t.fee_cents ?? 0), 0);

  return (
    <>
      <MonthHeader month={month} basePath="/" min={first} max={last} current={current} />

      {feeTotal > 0 && (
        <p className="surface flex items-center gap-3 px-5 py-3 text-[13px]">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
            <Receipt className="size-3.5" strokeWidth={2} />
          </span>
          <span className="flex-1 text-muted-foreground">
            Taxas de Pix no crédito neste mês, em {feeTx.length} Pix
          </span>
          <span className="font-semibold tabular-nums text-warning">{formatBRL(feeTotal)}</span>
        </p>
      )}

      {pending.length > 0 && (
        <Link
          href="/triagem"
          className="flex items-center gap-3 rounded-[22px] bg-warning/12 px-5 py-3.5 text-[13px] ring-1 ring-warning/30 transition-colors hover:bg-warning/18"
        >
          <Inbox className="size-5 shrink-0 text-warning" />
          <span className="flex-1">
            <b>{pending.length} gastos do banco sem categoria</b> ({formatBRL(pendingTotal)}) ainda <b>fora</b> do dia a dia e da
            projeção. Classifique na Triagem para os números ficarem certos.
          </span>
          <span className="font-semibold text-primary">Abrir triagem</span>
        </Link>
      )}

      {/* duas colunas independentes (como na referência): a altura de uma não estica a outra */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {row && <SaldoCard row={row} prevBalance={prevBalance} />}
          <div className="contents lg:grid lg:flex-1 lg:grid-cols-2 lg:gap-4">
            {status && budget ? (
              <DiaADiaCard
                status={status}
                method={budget.method}
                isCurrent={isCurrent}
                allWeekends={isCurrent ? remainingWeekends(today) : []}
                skipped={budget.skipped_weekends}
                items={monthTx}
                labels={bucketLabels(data.settings)}
                className="order-first lg:order-none"
              />
            ) : (
              <Panel title="Dia a dia" className="order-first lg:order-none">
                <p className="text-sm text-muted-foreground">Sem orçamento cadastrado para este mês.</p>
              </Panel>
            )}
            <CartoesCard month={invMonth} cards={inv.cards} total={inv.total} upcoming={upcoming} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:flex xl:flex-col">
          <ContasCard month={month} monthLabel={formatMonthLong(month).split(" ")[0]} bills={bills} />
          <ParcelasCard items={commit} income={row?.income ?? 0} className="xl:flex-1" />
        </div>

        <ProjecaoStrip rows={rows} selected={month} className="col-span-full" />
      </div>
    </>
  );
}
