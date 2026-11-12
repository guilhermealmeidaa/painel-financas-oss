import { invoicesForMonth } from "./invoices";
import type { BudgetLike, InstallmentLike, TransactionLike } from "./projection";

export type BillKind = "fatura" | "emprestimo" | "veiculo" | "conta";

export interface Bill {
  key: string; // 'card:<id>' | 'card:none' | 'fixed:<id>'
  name: string;
  kind: BillKind;
  cents: number;
  paid: boolean;
}

interface Params {
  month: string;
  cards: { id: string; name: string }[];
  fixed: { id: string; month: string; name: string; category: string; account_id: string | null; amount_cents: number }[];
  installments: (InstallmentLike & { name: string; account_id: string | null })[];
  transactions: (TransactionLike & { account_id: string | null })[];
  budgets: BudgetLike[];
  payments: { month: string; key: string }[];
  /** marcações de pago que você desfez (não voltam sozinhas) */
  dismissed?: { month: string; key: string }[];
  realBills?: { account_id: string; due_date: string; total_cents: number; status?: string | null }[];
}

/**
 * Contas a pagar do mês: uma fatura por cartão (parcelas antigas + novas + crédito do mês anterior)
 * e os fixos que não são cartão. O total bate com fixos + fatura + parcelas da projeção.
 */
export function billsForMonth(p: Params): { bills: Bill[]; total: number; paidTotal: number } {
  const paidKeys = new Set(p.payments.filter((x) => x.month === p.month).map((x) => x.key));
  const dismissedKeys = new Set((p.dismissed ?? []).filter((x) => x.month === p.month).map((x) => x.key));
  const monthBills = (accountId: string | null) =>
    (p.realBills ?? []).filter((b) => b.account_id === accountId && b.due_date.startsWith(p.month.slice(0, 7)));
  const inv = invoicesForMonth(p);
  // fatura que o banco já fechou: o "total" da Pluggy é o SALDO que falta pagar (ex.: 967 de compras,
  // 932,13 já pagos, faltam 34,90). É esse valor que vai para "Contas a pagar".
  const saldo = (accountId: string | null) => {
    const bills = monthBills(accountId);
    return bills.length ? bills.reduce((s, b) => s + b.total_cents, 0) : null;
  };
  // fatura que o banco marcou como paga (pagamento casado com a fatura do próprio cartão da Pluggy):
  // vale qualquer que seja o cartão cadastrado ligado a ele, então ligar/desligar cartão não muda nada
  const bankPaid = (accountId: string | null) => {
    const bills = monthBills(accountId);
    return bills.length > 0 && bills.every((b) => b.status === "paga");
  };
  const bills: Bill[] = [
    ...inv.cards
      .filter((c) => c.accountId !== "reserva" && c.accountId !== "plano")
      .map((c) => {
        const left = c.real ? saldo(c.accountId) : null;
        const key = `card:${c.accountId ?? "none"}`;
        return {
          key,
          name: (c.accountId ? `Fatura ${c.name.trim()}` : "Fatura (cartão não informado)") + (left != null && left < c.total ? " (saldo a pagar)" : ""),
          kind: "fatura" as const,
          cents: left ?? c.total,
          paid: (left != null && left <= 100) || (c.real === true && bankPaid(c.accountId) && !dismissedKeys.has(key)),
        };
      }),
    ...p.fixed
      .filter((f) => f.month === p.month && f.category !== "cartao" && f.amount_cents > 0)
      .map((f) => ({
        key: `fixed:${f.id}`,
        name: f.name,
        kind: f.category as BillKind,
        cents: f.amount_cents,
        paid: false,
      })),
  ]
    .map((b) => ({ ...b, paid: b.paid || paidKeys.has(b.key) }))
    .sort((a, b) => b.cents - a.cents);
  const total = bills.reduce((s, b) => s + b.cents, 0);
  const paidTotal = bills.filter((b) => b.paid).reduce((s, b) => s + b.cents, 0);
  return { bills, total, paidTotal };
}
