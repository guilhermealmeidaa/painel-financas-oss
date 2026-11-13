import { describe, expect, it } from "vitest";
import { findAnomalies, type AnomalyTx } from "@/lib/anomalies";
import { compareCategories, deltaLabel } from "@/lib/compare";

let n = 0;
const tx = (on: string, desc: string, reais: number, extra: Partial<AnomalyTx> = {}): AnomalyTx => ({
  id: `t${++n}`,
  occurred_on: on,
  description: desc,
  amount_cents: Math.round(reais * 100),
  account_id: "cartao",
  bucket: "lazer",
  is_inflow: false,
  external_id: `e${n}`,
  total_installments: null,
  auto_reason: null,
  ...extra,
});
const TODAY = "2026-11-13";

describe("gastos fora do padrão", () => {
  it("acima do normal: 2× a mediana e R$ 50 a mais", () => {
    const r = findAnomalies(
      [tx("2026-08-10", "PADARIA BOA", 20), tx("2026-09-10", "PADARIA BOA", 22), tx("2026-10-10", "PADARIA BOA", 18), tx("2026-11-10", "PADARIA BOA", 95)],
      TODAY,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "acima_do_normal", typical: 2000 });
  });

  it("não marca variação pequena nem comerciante sem histórico suficiente", () => {
    const r = findAnomalies([tx("2026-09-01", "MERCADO X", 100), tx("2026-10-01", "MERCADO X", 110), tx("2026-11-01", "MERCADO X", 180)], TODAY);
    expect(r).toEqual([]);
  });

  it("cobrança repetida: mesmo valor, mesmo cartão, 1 dia de diferença; aparece uma vez", () => {
    const r = findAnomalies([tx("2026-11-08", "LOJA Y", 59.9), tx("2026-11-09", "LOJA Y", 59.9)], TODAY);
    expect(r.map((a) => a.kind)).toEqual(["cobranca_repetida"]);
  });

  it("primeira compra alta (≥ R$ 300); ignora parcela, ignorados, entradas e manuais", () => {
    const r = findAnomalies(
      [
        tx("2026-11-05", "LOJA NOVA", 450),
        tx("2026-11-05", "CONTA DE LUZ", 400, { bucket: "fixo" }),
        tx("2026-11-05", "OUTRA 1/10", 900, { total_installments: 10, bucket: "parcela" }),
        tx("2026-11-05", "PAGAMENTO", 2000, { bucket: "ignorar" }),
        tx("2026-11-05", "SALARIO", 5000, { is_inflow: true }),
        tx("2026-11-05", "MANUAL", 800, { external_id: null }),
      ],
      TODAY,
    );
    expect(r.map((a) => [a.kind, a.tx.description])).toEqual([["primeira_vez_alta", "LOJA NOVA"]]);
  });

  it("janela: só os últimos N dias", () => {
    expect(findAnomalies([tx("2026-10-01", "LOJA VELHA", 500)], TODAY, 7)).toEqual([]);
  });
});

describe("comparativo por categoria", () => {
  it("diferença, % e rótulo", () => {
    const r = compareCategories(
      [
        { label: "Delivery", cents: 14000 },
        { label: "Viagem", cents: 30000 },
        { label: "Mercado", cents: 10100 },
      ],
      [
        { label: "Delivery", cents: 10000 },
        { label: "Mercado", cents: 10000 },
        { label: "Roupas", cents: 5000 },
      ],
    );
    expect(r[0]).toMatchObject({ label: "Viagem", diff: 30000, pct: null });
    expect(deltaLabel(r[0])).toBe("novo");
    expect(deltaLabel(r.find((x) => x.label === "Delivery")!)).toBe("+40%");
    expect(deltaLabel(r.find((x) => x.label === "Roupas")!)).toBe("−100%");
    expect(deltaLabel(r.find((x) => x.label === "Mercado")!)).toBe("igual");
  });
});
