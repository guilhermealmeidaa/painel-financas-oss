import Link from "next/link";
import { CreditCard } from "lucide-react";
import { CardTile } from "@/components/card-tile";
import { MonthHeader } from "@/components/month-header";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { invoiceInputs, loadAll } from "@/lib/data";
import { addMonths, formatMonthLong, formatMonthShort, monthOf, todayISO } from "@/lib/dates";
import { invoicesForMonth } from "@/lib/invoices";
import { formatBRL } from "@/lib/money";

export default async function FaturasPage(props: PageProps<"/faturas">) {
  const sp = await props.searchParams;
  const data = await loadAll();
  const current = monthOf(todayISO());
  const cards = data.accounts.filter((a) => a.kind === "credit_card");

  const calc = (month: string) =>
    invoicesForMonth({ ...invoiceInputs(data), month });

  // Próximo vencimento: primeiro mês a partir do atual com fatura > 0 (as de novembro já foram pagas).
  const next = [0, 1, 2, 3, 4, 5].map((n) => addMonths(current, n)).find((m) => calc(m).total > 0) ?? addMonths(current, 1);
  const selected = typeof sp.mes === "string" && /^\d{4}-\d{2}-01$/.test(sp.mes) ? sp.mes : next;
  const { cards: invoices, total, unlinkedSeedCards, seedNotFound } = calc(selected);
  const monthName = formatMonthLong(selected).split(" ")[0];

  return (
    <>
      <MonthHeader month={selected} basePath="/faturas" min={current} current={next} />

      {unlinkedSeedCards.length > 0 && (
        <Link href="/conexoes" className="rounded-2xl bg-warning/15 px-4 py-3 text-sm ring-1 ring-warning/30">
          <b>Cartões não ligados ao banco:</b> {unlinkedSeedCards.join(", ")}. A estimativa deles não entra; vale só o real dos cartões do banco. Ligar →
        </Link>
      )}
      {seedNotFound.length > 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Parcelas do plano ainda sem par no banco (contando como estimativa até casar): {seedNotFound.join(", ")}.
        </p>
      )}

      <Panel title="Cartões de crédito" icon={CreditCard}>
        <div>
          <Money cents={total} />
          <p className="text-xs text-muted-foreground">total das faturas que vencem em {monthName}</p>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {invoices.map((c) => (
          <Panel key={c.accountId ?? "none"}>
            <CardTile
              name={c.accountId ? c.name.trim() : "Não informado"}
              dueLabel={formatMonthShort(selected)}
              cents={c.total}
              badge={c.real ? "Fechada" : c.fromBank ? "Do banco" : c.accountId === "reserva" ? "Reserva" : "Estimativa"}
            />
            <div>
              <p className="text-xs text-muted-foreground">Fatura de {monthName}</p>
              <Money cents={c.total} size="md" />
            </div>
            {(() => {
              const acc = cards.find((a) => a.id === c.accountId);
              if (!acc || acc.available_limit_cents == null || !acc.credit_limit_cents) return null;
              const used = Math.max(acc.credit_limit_cents - acc.available_limit_cents, 0);
              return (
                <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Limite disponível</span>
                    <span className="font-semibold text-positive tabular-nums">{formatBRL(acc.available_limit_cents)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-positive/25">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(used / acc.credit_limit_cents) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    de {formatBRL(acc.credit_limit_cents)}
                    {acc.bill_due_date && ` · vence ${acc.bill_due_date.slice(8, 10)}/${acc.bill_due_date.slice(5, 7)}`}
                  </p>
                </div>
              );
            })()}
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 p-3 text-sm">
              {c.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">{l.label}</span>
                  <span className="font-medium tabular-nums">{formatBRL(l.cents)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      {invoices.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fatura prevista para {monthName}.</p>}

      <p className="text-xs text-muted-foreground">
        Estimativa a partir dos fixos de cartão, das parcelas novas e dos gastos no crédito do mês anterior. Na Fase 2 os valores
        reais da Pluggy substituem isto.
      </p>
    </>
  );
}
