import { describe, expect, it } from "vitest";
import { monthHistory, type HistTx } from "@/lib/history";
import { monthsFrom } from "@/lib/validate";

const t = (p: Partial<HistTx>): HistTx => ({
  occurred_on: "2026-10-10",
  description: "x",
  amount_cents: 1000,
  method: "debito",
  is_inflow: false,
  bucket: "ignorar",
  pluggy_category: null,
  account_kind: "checking",
  source: "pluggy",
  external_id: "e",
  ...p,
});

describe("histórico do mês (dados do banco)", () => {
  it("não conta pagamento de fatura, Pix pra si mesmo nem pagamento recebido no cartão", () => {
    const h = monthHistory([
      t({ description: "SALARIO", amount_cents: 690000, is_inflow: true }),
      t({ description: "Transferência recebida|Maria", amount_cents: 50000, is_inflow: true, pluggy_category: "Same person transfer" }),
      t({ description: "Pagamento recebido", amount_cents: 150000, is_inflow: true, account_kind: "credit_card", method: "credito" }),
      t({ description: "PAGAMENTO CARTAO CREDITO", amount_cents: 149506, pluggy_category: "Credit card payment" }),
      t({ description: "Pagamento de fatura", amount_cents: 100000, pluggy_category: "Transfers" }),
      t({ description: "IFOOD", amount_cents: 14655, account_kind: "credit_card", method: "credito", pluggy_category: "Food delivery" }),
      t({ description: "Transferência enviada pelo Pix|CLARO S A", amount_cents: 19789, method: "pix", pluggy_category: "Mobile" }),
      t({ description: "lançamento manual sem banco", amount_cents: 99999, external_id: null, source: "manual" }),
    ]);
    expect(h.totalIn).toBe(690000);
    expect(h.totalOut).toBe(14655 + 19789);
    expect(h.onCard).toBe(14655);
    expect(h.byCategory.map((c) => c.label)).toEqual(["Celular", "Delivery"]);
  });
});

describe("repetir por N meses", () => {
  it("gera meses seguidos e limita a 36", () => {
    expect(monthsFrom("2026-12-01", 3)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(monthsFrom("2026-12-01", 999)).toHaveLength(36);
    expect(monthsFrom("2026-12-01", "abc")).toEqual(["2026-12-01"]);
  });
});
