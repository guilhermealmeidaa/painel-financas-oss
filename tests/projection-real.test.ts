// A projeção "real primeiro" (faturas por mês) dá os mesmos saldos do plano quando não há cartão ligado.
import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import { invoicesForMonth, prepareInvoices } from "@/lib/invoices";
import { project } from "@/lib/projection";
import { budgets, incomes, installments, novTransactions, range } from "./fixtures";

const cardFixed = [
  ["Cartão Nubank", 0, 108000, 80000, 58900],
  ["Cartão Inter", 0, 72900, 67700, 33400],
  ["Cartão Santander", 0, 70000, 54600, 42700],
  ["Cartão Mercado Pago", 0, 101200, 101200, 85900],
] as const;
const otherFixed = [
  [42000, 38000, 22000, 22000],
  [0, 30400, 30400, 30400],
  [39300, 39300, 39300, 39300],
  [60000, 68000, 68000, 68000],
  [0, 54200, 54200, 54200],
  [0, 20000, 20000, 20000],
];
const months = ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"];
const fixed = [
  ...cardFixed.flatMap(([name, ...v]) => months.map((month, i) => ({ month, name, category: "cartao", account_id: null, amount_cents: v[i] }))),
  ...otherFixed.flatMap((v, k) => months.map((month, i) => ({ month, name: `f${k}`, category: "conta", account_id: null, amount_cents: v[i] }))),
];

describe("projeção somando faturas", () => {
  it("bate os saldos do plano: 2.287 / 1.461,82 / 1.049,31 / 1.462,80", () => {
    const inputs = {
      cards: [],
      fixed,
      installments: installments.map((i, n) => ({ ...i, id: `s${n}`, name: `p${n}`, account_id: null })),
      transactions: novTransactions.map((t) => ({ ...t, account_id: null, source: "manual" })),
      budgets,
    };
    const prep = prepareInvoices(inputs);
    const cardTotals = new Map(
      monthRange(range.start, range.end).map((m) => [m, m === range.start ? 0 : invoicesForMonth({ ...inputs, month: m }, prep).total]),
    );
    const rows = project({
      ...range,
      openingBalanceCents: 0,
      incomes,
      fixedExpenses: fixed.filter((f) => f.category !== "cartao"),
      installments: inputs.installments,
      budgets,
      transactions: novTransactions,
      cardTotals,
    });
    expect(rows.map((r) => r.balance)).toEqual([228_700, 146_182, 104_931, 146_280]);
    // dezembro: 3.521 de cartões antigos + 205,18 de parcelas novas + 1.500 do teto de novembro
    expect(rows[1].creditInvoice).toBe(352100 + 20518 + 150000);
  });
});
