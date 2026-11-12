import { describe, expect, it } from "vitest";
import { invoicesForMonth } from "@/lib/invoices";
import { budgets, installments, novTransactions } from "./fixtures";

const cards = [
  { id: "nu", name: "Nubank" },
  { id: "inter", name: "Inter" },
];
const fixed = [
  { month: "2026-12-01", name: "Cartão Nubank", category: "cartao", account_id: "nu", amount_cents: 108000 },
  { month: "2026-12-01", name: "Cartão Inter", category: "cartao", account_id: "inter", amount_cents: 72900 },
  { month: "2026-12-01", name: "Financiamento do carro", category: "veiculo", account_id: null, amount_cents: 68000 },
];

describe("faturas previstas de dezembro", () => {
  const inst = installments.map((i, n) => ({ ...i, name: `p${n}`, account_id: null }));
  const txs = novTransactions.map((t) => ({ ...t, account_id: null }));

  it("soma parcelas antigas, novas, gastos de nov e a reserva do teto", () => {
    const { cards: inv, total } = invoicesForMonth({ month: "2026-12-01", cards, fixed, installments: inst, transactions: txs, budgets });
    expect(inv.find((c) => c.accountId === "nu")?.total).toBe(108000);
    expect(inv.find((c) => c.accountId === "inter")?.total).toBe(72900);
    const none = inv.find((c) => c.accountId === null)!;
    // 49 + 18,70 + 137,48 de parcelas novas + 833 gastos
    expect(none.total).toBe(4900 + 1870 + 13748 + 83300);
    // os 667 que faltam do teto de 1.500 ficam numa linha própria, não num cartão
    expect(inv.find((c) => c.accountId === "reserva")?.total).toBe(66700);
    expect(total).toBe(108000 + 72900 + 4900 + 1870 + 13748 + 150000);
  });

  it("gasto com cartão informado vai para a fatura daquele cartão", () => {
    const withCard = [...txs, { occurred_on: "2026-11-14", amount_cents: 10000, method: "credito" as const, bucket: "mercado" as const, account_id: "inter" }];
    const { cards: inv, total } = invoicesForMonth({ month: "2026-12-01", cards, fixed, installments: inst, transactions: withCard, budgets });
    expect(inv.find((c) => c.accountId === "inter")?.total).toBe(72900 + 10000);
    // o total não muda: o gasto sai da reserva
    expect(total).toBe(108000 + 72900 + 4900 + 1870 + 13748 + 150000);
  });
});
