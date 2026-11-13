import { pendingIncomes } from "@/lib/anchor";
import { billsForMonth } from "@/lib/bills";
import { invoiceInputs, type AllData } from "@/lib/data";
import { addDays, addMonths } from "@/lib/dates";
import { AUTO_DEBIT, dayInMonth, likelyDay } from "@/lib/mcp/phase2";

/** Um compromisso do mês com data: fatura, fixo ou entrada. */
export interface ScheduleItem {
  key: string;
  date: string | null;
  name: string;
  cents: number;
  type: "saida" | "entrada";
  kind: string;
  paid: boolean;
  autoDebit: boolean;
}

/**
 * Agenda do mês: faturas e fixos (pagos ou não) com o vencimento conhecido ou provável, e as entradas
 * (recebidas, com a data do banco; previstas, com o dia em que caíram no mês anterior).
 * Mesma regra do MCP proximos_vencimentos e do Calendário.
 */
export function monthSchedule(d: AllData, month: string, today: string): ScheduleItem[] {
  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const out: ScheduleItem[] = [];
  const { bills } = billsForMonth({ ...invoiceInputs(d), month, payments: d.payments });
  for (const b of bills) {
    if (b.key.startsWith("card:")) {
      const acc = d.accounts.find((a) => `card:${a.id}` === b.key);
      const bill = d.cardBills.find((x) => x.account_id === acc?.id && x.due_date.startsWith(month.slice(0, 7)));
      const due = bill?.due_date ?? (acc?.due_day ? dayInMonth(month, acc.due_day) : null);
      // débito automático: o cartão teve "PAGTO DEBITO AUTOMATICO" nos últimos 100 dias
      const autoDebit = d.transactions.some(
        (t) => t.account_id === acc?.id && t.is_inflow && t.occurred_on >= addDays(today, -100) && AUTO_DEBIT.test(t.description),
      );
      out.push({ key: b.key, date: due, name: b.name, cents: b.cents, type: "saida", kind: "fatura", paid: b.paid, autoDebit });
    } else {
      const fx = d.fixed.find((f) => `fixed:${f.id}` === b.key);
      // dia provável: quando o mesmo fixo foi pago antes (marcação com a transação do banco)
      const sameName = d.fixed.filter((f) => f.name === fx?.name).map((f) => `fixed:${f.id}`);
      const pays = d.payments
        .filter((p) => sameName.includes(p.key) && p.transaction_id)
        .map((p) => txById.get(p.transaction_id!))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
      const day = likelyDay(pays.map((t) => t.occurred_on));
      out.push({
        key: b.key,
        date: day ? dayInMonth(month, day) : null,
        name: b.name,
        cents: b.cents,
        type: "saida",
        kind: b.kind,
        paid: b.paid,
        autoDebit: pays.some((t) => AUTO_DEBIT.test(t.description)),
      });
    }
  }

  // entradas: recebidas (data do banco) e previstas ainda pendentes (dia em que caíram no mês anterior)
  const bank = d.incomes.filter((i) => i.month === month && i.source === "banco");
  for (const i of bank) {
    const on = i.transaction_id ? (txById.get(i.transaction_id)?.occurred_on ?? null) : null;
    out.push({ key: `income:${i.id}`, date: on, name: i.description, cents: i.amount_cents, type: "entrada", kind: i.kind, paid: true, autoDebit: false });
  }
  const planned = d.incomes.filter((i) => i.month === month && i.source === "manual");
  const prevBank = d.incomes.filter((i) => i.month === addMonths(month, -1) && i.source === "banco" && i.transaction_id);
  for (const p of pendingIncomes(planned, bank)) {
    const like = prevBank.find((b) => Math.abs(b.amount_cents - p.amount_cents) <= p.amount_cents * 0.05);
    const on = like?.transaction_id ? txById.get(like.transaction_id)?.occurred_on : null;
    out.push({
      key: `planned:${p.id}`,
      date: on ? dayInMonth(month, Number(on.slice(8, 10))) : null,
      name: p.description,
      cents: p.amount_cents,
      type: "entrada",
      kind: p.kind,
      paid: false,
      autoDebit: false,
    });
  }
  return out.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name));
}
