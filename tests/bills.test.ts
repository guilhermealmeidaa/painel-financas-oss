import { describe, expect, it } from "vitest";
import { billsForMonth } from "@/lib/bills";

/**
 * Item 14: ligar VISA PLUS → Santander troca o id da conta. A marcação de "paga" antiga
 * (bill_payments com a chave card:<id antigo>) deixa de casar, e a fatura voltava como não paga.
 * Regra: a fatura que o banco marcou como paga (pagamento casado com a fatura do próprio cartão
 * da Pluggy) é paga, qualquer que seja o cartão cadastrado ligado a ele.
 */
function scenario(cardId: string, cardName: string, payments: { month: string; key: string }[], dismissed: { month: string; key: string }[] = []) {
  return billsForMonth({
    month: "2026-11-01",
    cards: [{ id: cardId, name: cardName, pluggy_account_id: "pluggy-fv", closing_day: 27, due_day: 4 }] as never,
    fixed: [],
    installments: [],
    budgets: [],
    transactions: [
      {
        id: "c1",
        account_id: cardId,
        occurred_on: "2026-10-20",
        amount_cents: 150000,
        bucket: "lazer",
        method: "credito",
        description: "COMPRAS DO MÊS",
        pluggy_bill_id: "bill-nov",
      },
    ] as never,
    realBills: [{ account_id: cardId, due_date: "2026-11-04", closing_date: "2026-10-27", total_cents: 150000, pluggy_bill_id: "bill-nov", status: "paga" }],
    payments,
    dismissed,
  } as never);
}

describe("fatura paga não depende do cartão ligado", () => {
  it("fatura paga no banco aparece paga mesmo sem marcação em bill_payments", () => {
    const { bills } = scenario("santander", "Santander", []);
    expect(bills).toHaveLength(1);
    expect(bills[0].paid).toBe(true);
  });

  it("ligar e desligar o cartão (id muda, marcação antiga fica órfã) não muda paga nem o total a pagar", () => {
    const antes = scenario("free-visa", "VISA PLUS", [{ month: "2026-11-01", key: "card:free-visa" }]);
    const depois = scenario("santander", "Santander", [{ month: "2026-11-01", key: "card:free-visa" }]);
    const unpaid = (r: ReturnType<typeof scenario>) => r.bills.filter((b) => !b.paid).reduce((s, b) => s + b.cents, 0);
    expect(antes.bills.map((b) => b.paid)).toEqual(depois.bills.map((b) => b.paid));
    expect(unpaid(depois)).toBe(unpaid(antes));
    expect(unpaid(depois)).toBe(0);
  });

  it("se você desmarcou a fatura, ela continua não paga mesmo com o banco dizendo paga", () => {
    const { bills } = scenario("santander", "Santander", [], [{ month: "2026-11-01", key: "card:santander" }]);
    expect(bills[0].paid).toBe(false);
  });
});
