// Regra 13: o mês atual parte do saldo real das contas.
import { describe, expect, it } from "vitest";
import { anchorCurrentMonth } from "@/lib/anchor";
import { project } from "@/lib/projection";

describe("saldo real das contas como ponto de partida", () => {
  const base = {
    balanceCents: 2147, // R$ 21,47 hoje nas contas
    plannedIncomes: [{ amount_cents: 370000, description: "13º (1ª parcela)" }],
    bankIncomes: [{ amount_cents: 50000 }], // EFICAZ 500 já entrou: está no saldo
    unpaidBills: [
      { cents: 60000, kind: "veiculo", name: "Financiamento do carro" },
      { cents: 42000, kind: "emprestimo", name: "Empréstimo pessoal" },
      { cents: 3490, kind: "fatura", name: "Fatura Cartão Gold (saldo a pagar)" },
      { cents: 90553, kind: "fatura", name: "Fatura Mercado Pago" },
    ],
    budget: { cap_cents: 150000, method: "credito" as const },
    dailySpentCents: 98181,
  };

  it("saldo_no_fim = saldo atual + 13º + entradas pendentes − fixos não pagos − faturas a vencer − dia a dia débito restante", () => {
    const a = anchorCurrentMonth(base);
    expect(a.balance).toBe(2147 + 370000 - (60000 + 42000) - (3490 + 90553) - 0);
    // luz, internet e empréstimo da empresa pagos em 05/11 com o salário que entrou no mesmo dia: os dois já estão no saldo,
    // nenhum é contado de novo
    expect(a.pendingIncomeItems).toEqual(["13º (1ª parcela)"]);
  });

  it("no crédito, o que falta do teto vai para a fatura seguinte; no débito/Pix, sai da conta este mês", () => {
    expect(anchorCurrentMonth(base).dailyRemaining).toBe(0);
    const debit = anchorCurrentMonth({ ...base, budget: { cap_cents: 200000, method: "debito_pix" }, dailySpentCents: 50000 });
    expect(debit.dailyRemaining).toBe(150000);
  });

  it("entrada planejada que já caiu no banco (±5%) não conta de novo", () => {
    const a = anchorCurrentMonth({ ...base, bankIncomes: [{ amount_cents: 369500 }] });
    expect(a.pendingIncome).toBe(0);
  });

  it("os meses seguintes continuam a conta normal a partir do saldo ancorado", () => {
    const anchor = anchorCurrentMonth(base);
    const rows = project({
      start: "2026-11-01",
      end: "2026-12-01",
      openingBalanceCents: 0,
      incomes: [{ month: "2026-12-01", amount_cents: 890000 }],
      fixedExpenses: [{ month: "2026-12-01", amount_cents: 249900 }],
      installments: [],
      budgets: [{ month: "2026-12-01", cap_cents: 200000, method: "debito_pix" }],
      transactions: [],
      cardTotals: new Map([["2026-12-01", 470610]]),
      anchor: { month: "2026-11-01", ...anchor },
    });
    expect(rows[0].balance).toBe(anchor.balance);
    expect(rows[0].opening).toBe(2147);
    expect(rows[1].balance).toBe(anchor.balance + 890000 - 249900 - 470610 - 200000);
  });
});
