import { billsForMonth } from "@/lib/bills";
import { invoiceInputs, type AllData } from "@/lib/data";
import { addMonths, monthOf } from "@/lib/dates";
import { installmentAmountInMonth, installmentEndMonth } from "@/lib/projection";

export interface Debt {
  name: string;
  kind: "Empréstimo" | "Veículo" | "Parcelas antigas do cartão" | "Compra parcelada";
  /** valor do mês atual (ou do próximo, se o atual já foi pago) */
  monthly: number;
  total: number;
  paid: number;
  remaining: number;
  firstMonth: string;
  endMonth: string;
  monthsLeft: number;
}

const FIXED_KIND = { emprestimo: "Empréstimo", veiculo: "Veículo", cartao: "Parcelas antigas do cartão" } as const;

/**
 * Dívidas do plano, tiradas do Planejamento (fixos de empréstimo, veículo e parcelas antigas de cartão) e das compras
 * parceladas ativas. Pago = meses anteriores + o mês atual se já marcado/pago; falta = o resto até o último mês.
 */
export function debtSummary(d: AllData, today: string) {
  const current = monthOf(today);
  const { bills } = billsForMonth({ ...invoiceInputs(d), month: current, payments: d.payments });
  const paidNow = new Set(bills.filter((b) => b.paid).map((b) => b.key));
  const debts: Debt[] = [];

  // fixos de dívida: agrupa os meses pelo nome (cada mês é uma linha no Planejamento)
  const groups = new Map<string, AllData["fixed"]>();
  for (const f of d.fixed) {
    if (!(f.category in FIXED_KIND)) continue;
    const k = `${f.category}|${f.name.trim().toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  for (const rows of groups.values()) {
    const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
    const isPaid = (f: (typeof sorted)[number]) => f.month < current || (f.month === current && paidNow.has(`fixed:${f.id}`));
    const total = sorted.reduce((s, f) => s + f.amount_cents, 0);
    const paid = sorted.filter(isPaid).reduce((s, f) => s + f.amount_cents, 0);
    const left = sorted.filter((f) => !isPaid(f));
    if (!left.length) continue;
    debts.push({
      name: sorted[0].name.trim(),
      kind: FIXED_KIND[sorted[0].category as keyof typeof FIXED_KIND],
      monthly: left[0].amount_cents,
      total,
      paid,
      remaining: total - paid,
      firstMonth: sorted[0].month,
      endMonth: sorted.at(-1)!.month,
      monthsLeft: left.length,
    });
  }

  // compras parceladas do plano (as do banco já cobertas entram pelo cartão; aqui só as do plano)
  for (const p of d.installments.filter((i) => i.status === "ativa")) {
    const end = installmentEndMonth(p);
    if (end < current) continue;
    const cardPaid = p.account_id ? paidNow.has(`card:${p.account_id}`) : false;
    let paid = 0;
    let left = 0;
    for (let m = p.first_invoice_month; m <= end; m = addMonths(m, 1)) {
      const v = installmentAmountInMonth(p, m);
      if (m < current || (m === current && cardPaid)) paid += v;
      else left++;
    }
    const total = p.installment_cents * p.installments_count;
    if (!left) continue;
    debts.push({
      name: p.name,
      kind: "Compra parcelada",
      monthly: p.installment_cents,
      total,
      paid,
      remaining: total - paid,
      firstMonth: p.first_invoice_month,
      endMonth: end,
      monthsLeft: left,
    });
  }

  debts.sort((a, b) => a.endMonth.localeCompare(b.endMonth) || b.remaining - a.remaining);
  const freeMonth = debts.reduce((m, x) => (x.endMonth > m ? x.endMonth : m), "");
  // quanto sai de dívida em cada mês daqui até ficar livre
  const perMonth: { month: string; cents: number }[] = [];
  for (let m = current; freeMonth && m <= freeMonth; m = addMonths(m, 1)) {
    let cents = 0;
    for (const f of d.fixed) if (f.category in FIXED_KIND && f.month === m && !(m === current && paidNow.has(`fixed:${f.id}`))) cents += f.amount_cents;
    for (const p of d.installments.filter((i) => i.status === "ativa")) {
      if (m === current && p.account_id && paidNow.has(`card:${p.account_id}`)) continue;
      cents += installmentAmountInMonth(p, m);
    }
    perMonth.push({ month: m, cents });
  }
  const total = debts.reduce((s, x) => s + x.total, 0);
  const paid = debts.reduce((s, x) => s + x.paid, 0);
  return { debts, total, paid, remaining: total - paid, freeMonth: freeMonth || null, perMonth };
}
