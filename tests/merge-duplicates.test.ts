// Regras 2 (1 manual × N transações do banco) e 8 (duplicatas sem falsos positivos). Fixtures anonimizadas.
import { describe, expect, it } from "vitest";
import { findDuplicates, sameMerchant, type DupTx } from "@/lib/duplicates";
import { suggestMerges, type MergeTx } from "@/lib/merge";

const m = (id: string, on: string, reais: number, description: string, method = "credito"): MergeTx => ({
  id,
  occurred_on: on,
  amount_cents: Math.round(reais * 100),
  method,
  description,
});

describe("regra 2: juntar 1 manual com N compras do banco", () => {
  const manual = [
    m("saida", "2026-11-06", 58, "Saída à noite"),
    m("jantar", "2026-11-07", 161, "Jantar de sexta"),
    m("mercado", "2026-11-10", 55, "Mercado"),
  ];
  const bank = [
    m("anna1", "2026-11-06", 15.89, "Anna C. S."),
    m("anna2", "2026-11-06", 29.66, "Anna C. S."),
    m("bc", "2026-11-06", 17.49, "LOJA CONVENIENCIA"),
    m("ifood", "2026-11-07", 146.55, "IFOOD.COM"),
    m("sorvete", "2026-11-07", 23.22, "SORVETERIA GELATO"),
    m("alexia", "2026-11-10", 31.6, "ALEXIA R D"),
    m("odineia", "2026-11-10", 27.39, "ODINEIA A R"),
    m("pet", "2026-11-15", 45.09, "PET SHOP"),
  ];
  const s = Object.fromEntries(suggestMerges(manual, bank).map((x) => [x.manualId, [...x.bankIds].sort()]));

  it("acha as combinações reais de novembro", () => {
    expect(s.saida).toEqual(["anna1", "anna2", "bc"]); // 63,04 vs 58 (+8,7%)
    expect(s.jantar).toEqual(["ifood", "sorvete"]); // 169,77 vs 161 (+5,4%)
    expect(s.mercado).toEqual(["alexia", "odineia"]); // 58,99 vs 55 (+7,3%)
  });

  it("não usa a mesma compra em dois manuais e não passa de ±15%", () => {
    const r = suggestMerges([m("a", "2026-11-01", 100, "x"), m("b", "2026-11-01", 100, "y")], [m("c", "2026-11-01", 100, "z")]);
    expect(r).toHaveLength(1);
    expect(suggestMerges([m("a", "2026-11-01", 100, "x")], [m("c", "2026-11-01", 80, "z")])).toEqual([]);
  });

  it("respeita tipo (crédito × Pix) e janela de ±1 dia", () => {
    expect(suggestMerges([m("a", "2026-11-01", 18, "Cookies")], [m("pix", "2026-11-01", 18, "Pix", "pix")])).toEqual([]);
    expect(suggestMerges([m("a", "2026-11-01", 50, "x")], [m("c", "2026-11-03", 50, "z")])).toEqual([]);
  });
});

const d = (p: Partial<DupTx> & { id: string; description: string; reais: number; on: string }): DupTx => ({
  id: p.id,
  occurred_on: p.on,
  description: p.description,
  amount_cents: Math.round(p.reais * 100),
  is_inflow: false,
  bucket: p.bucket ?? "sem_categoria",
  account_id: p.account_id ?? "card",
  source: p.source ?? "pluggy",
  external_id: p.external_id ?? `ext-${p.id}`,
  pluggy_status: p.pluggy_status ?? "POSTED",
  auto_reason: p.auto_reason ?? null,
  linked_tx_id: p.linked_tx_id ?? null,
  superseded: p.superseded ?? false,
  manual_id: null,
});

describe("regra 8: possíveis duplicatas", () => {
  it("não aponta coincidência de valor sem nada em comum", () => {
    const pairs = findDuplicates([
      d({ id: "rem", description: "Remédio dos cachorros", reais: 50, on: "2026-11-11", account_id: "card-a" }),
      d({ id: "ms", description: "Microsoft*Microsoft 365 P", reais: 51, on: "2026-11-09", account_id: "card-b" }),
      d({ id: "x", description: "X Corp. Paid Features", reais: 5.08, on: "2026-11-10" }),
      d({ id: "iof", description: "IOF DESPESA NO EXTERIOR", reais: 4.11, on: "2026-11-07" }),
    ]);
    expect(pairs).toEqual([]);
  });

  it("ignora pares já explicados pelo Pix no crédito", () => {
    const pairs = findDuplicates([
      d({ id: "out", description: "Transferência enviada|BEATRIZ SOUZA", reais: 15, on: "2026-11-06", auto_reason: "pix_no_credito", bucket: "ignorar", linked_tx_id: "card" }),
      d({ id: "card", description: "Beatriz Souza Lima", reais: 15.89, on: "2026-11-06" }),
    ]);
    expect(pairs).toEqual([]);
  });

  it("aponta manual × banco, mesma loja e PENDING × POSTED", () => {
    const pairs = findDuplicates([
      d({ id: "man", description: "Uber pra casa", reais: 31.93, on: "2026-11-03", source: "manual", external_id: null }),
      d({ id: "bank", description: "Dl *Uberrides", reais: 31.93, on: "2026-11-03" }),
      d({ id: "p", description: "PET SHOP AMIGO", reais: 45.09, on: "2026-11-15", pluggy_status: "PENDING" }),
      d({ id: "q", description: "PET SHOP AMIGO", reais: 45.09, on: "2026-11-16", pluggy_status: "POSTED" }),
    ]);
    const ids = pairs.map((p) => [p.a.id, p.b.id].sort().join("+")).sort();
    expect(ids).toEqual(["bank+man", "p+q"]);
    expect(pairs.find((p) => p.a.id === "p" || p.b.id === "p")?.reasons).toContain("PENDING × POSTED na mesma conta");
  });
});

describe("regra 4: nomes parecidos com limiar alto", () => {
  it("Taisa Costa Correa × Antonio Alves de Lima não é a mesma pessoa", () => {
    expect(sameMerchant("Transferência enviada pelo Pix|Taisa Costa Co", "Transferência enviada pelo Pix|ANTONIO ALVES ")).toBe(false);
    expect(
      findDuplicates([
        d({ id: "t", description: "Transferência enviada pelo Pix|Taisa Costa Co", reais: 10, on: "2026-11-08", account_id: "conta" }),
        d({ id: "a", description: "Transferência enviada pelo Pix|ANTONIO ALVES ", reais: 10, on: "2026-11-07", account_id: "conta" }),
      ]),
    ).toEqual([]);
  });
  it("mesma loja com descrição truncada ainda casa", () => {
    expect(sameMerchant("PET SHOP AMIGO", "PET SHOP AMIGO LTDA")).toBe(true);
    expect(sameMerchant("Transferência enviada|BEATRIZ SOUZA LIMA", "Beatriz Souza Lima")).toBe(true);
  });
});
