// Plano de exemplo (dados fictícios) em formato da lógica pura.
import type { BudgetLike, InstallmentLike, MonthAmount, TransactionLike } from "@/lib/projection";

const NOV = "2026-11-01", DEZ = "2026-12-01", JAN = "2027-01-01", FEV = "2027-02-01";

export const incomes: MonthAmount[] = [
  { month: NOV, amount_cents: 370000 },
  { month: DEZ, amount_cents: 690000 },
  { month: DEZ, amount_cents: 200000 },
  { month: JAN, amount_cents: 690000 },
  { month: FEV, amount_cents: 690000 },
];

const fixedTable: [string, number, number, number, number][] = [
  ["Cartão Nubank", 0, 108000, 80000, 58900],
  ["Cartão Inter", 0, 72900, 67700, 33400],
  ["Cartão Santander", 0, 70000, 54600, 42700],
  ["Cartão Mercado Pago", 0, 101200, 101200, 85900],
  ["Empréstimo pessoal", 42000, 38000, 22000, 22000],
  ["Empréstimo consignado", 0, 30400, 30400, 30400],
  ["Empréstimo da empresa", 39300, 39300, 39300, 39300],
  ["Financiamento do carro", 60000, 68000, 68000, 68000],
  ["Luz", 0, 54200, 54200, 54200],
  ["Internet", 0, 20000, 20000, 20000],
];
export const fixedExpenses: MonthAmount[] = fixedTable.flatMap(([, ...v]) =>
  [NOV, DEZ, JAN, FEV].map((month, i) => ({ month, amount_cents: v[i] })),
);

export const installments: InstallmentLike[] = [
  { installment_cents: 4900, installments_count: 4, first_invoice_month: DEZ, status: "ativa" },
  { installment_cents: 1870, installments_count: 12, first_invoice_month: DEZ, status: "ativa" },
  { installment_cents: 13748, installments_count: 4, first_invoice_month: DEZ, status: "ativa" },
  { installment_cents: 23333, installments_count: 3, first_invoice_month: JAN, status: "ativa" },
  { installment_cents: 4167, installments_count: 12, first_invoice_month: JAN, status: "planejada" },
];

export const budgets: BudgetLike[] = [
  { month: NOV, cap_cents: 150000, method: "credito" },
  { month: DEZ, cap_cents: 200000, method: "debito_pix" },
  { month: JAN, cap_cents: 150000, method: "debito_pix" },
  { month: FEV, cap_cents: 150000, method: "debito_pix" },
];

export const novTransactions: TransactionLike[] = [
  { occurred_on: "2026-11-06", amount_cents: 12000, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-06", amount_cents: 5800, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-07", amount_cents: 27500, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-07", amount_cents: 16100, method: "credito", bucket: "mercado" },
  { occurred_on: "2026-11-10", amount_cents: 9600, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-10", amount_cents: 5500, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-11", amount_cents: 5000, method: "credito", bucket: "lazer" },
  { occurred_on: "2026-11-11", amount_cents: 1800, method: "credito", bucket: "lazer" },
];

export const range = { start: NOV, end: FEV };
