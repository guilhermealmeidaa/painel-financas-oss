// Regras 1 (Pix no crédito), 3 (pagamento de fatura / transferência própria), 7 (IOF), 9 (regras) e 10 (entradas).
// Fixtures anonimizadas a partir dos casos reais de nov/2026.
import { describe, expect, it } from "vitest";
import { detectIncomes, runEngine, sameParty, type EngineRule, type EngineTx } from "@/lib/engine";

let seq = 0;
const tx = (p: Partial<EngineTx> & { description: string; reais: number; on: string }): EngineTx => ({
  id: p.id ?? `t${++seq}`,
  occurred_on: p.on,
  description: p.description,
  amount_cents: Math.round(p.reais * 100),
  is_inflow: p.is_inflow ?? false,
  method: p.method ?? (p.account_kind === "credit_card" ? "credito" : "pix"),
  bucket: p.bucket ?? (p.is_inflow ? "ignorar" : "sem_categoria"),
  account_id: p.account_id ?? (p.account_kind === "credit_card" ? "card-nu" : "conta-nu"),
  account_kind: p.account_kind ?? "checking",
  pluggy_category: p.pluggy_category ?? null,
  source: p.source ?? "pluggy",
  user_locked: p.user_locked ?? false,
  superseded: false,
  auto_reason: p.auto_reason ?? null,
});
const card = (id: string, description: string, reais: number, on: string, extra: Partial<EngineTx> = {}) =>
  tx({ id, description, reais, on, account_kind: "credit_card", ...extra });
/** as duas pernas da conta de um Pix no crédito */
const pixLegs = (id: string, nome: string, reais: number, on: string) => [
  tx({ id: `${id}-in`, description: "Valor adicionado na conta por cartão de crédito|Valor adicionado", reais, on, is_inflow: true }),
  tx({ id: `${id}-out`, description: `Transferência enviada|${nome}`, reais, on }),
];
const self = { names: ["Fulano de Tal Silva"], taxIds: ["11222333"] };
const RULES: EngineRule[] = [
  { pattern: "DISCORD", bucket: "fixo", subtype: "assinatura", origin: "padrao" },
  { pattern: "UBER", bucket: "lazer", subtype: null, origin: "padrao" },
  { pattern: "POSTO", bucket: "lazer", subtype: null, origin: "padrao" },
  { pattern: "IFOOD", bucket: "mercado", subtype: null, origin: "usuario" },
  { pattern: "IFOOD CLUB", bucket: "fixo", subtype: "assinatura", origin: "padrao" },
];

describe("regra 1: Pix no crédito", () => {
  const txs = [
    ...pixLegs("anna", "BEATRIZ SOUZA LIMA", 15, "2026-11-06"),
    card("c-anna", "Beatriz Souza Lima", 15.89, "2026-11-06"),
    ...pixLegs("barb", "BARBEARIA CENTRAL LTDA", 106, "2026-11-06"),
    card("c-barb", "BARBEARIA CENTRAL LTDA", 123.54, "2026-11-07"),
    ...pixLegs("posto", "POSTO CENTRAL LTDA", 62.37, "2026-11-08"),
    card("c-posto", "POSTO CENTRAL LTDA", 72.15, "2026-11-08"),
    // nome diferente no cartão: casa por ser o único candidato no valor/data
    ...pixLegs("berm", "JOAO PEREIRA", 15, "2026-11-12"),
    card("c-bc", "LOJA CONVENIENCIA", 17.49, "2026-11-12"),
  ];
  const d = runEngine({ txs, rules: RULES, self });

  it("as duas pernas da conta viram ignorar, ligadas à compra do cartão", () => {
    for (const [leg, cardId] of [
      ["anna", "c-anna"],
      ["barb", "c-barb"],
      ["posto", "c-posto"],
      ["berm", "c-bc"],
    ]) {
      expect(d.get(`${leg}-out`)).toMatchObject({ bucket: "ignorar", auto_reason: "pix_no_credito", linked_tx_id: cardId });
      expect(d.get(`${leg}-in`)).toMatchObject({ bucket: "ignorar", auto_reason: "pix_no_credito" });
    }
  });

  it("guarda a taxa na compra do cartão e a compra segue sua própria categoria", () => {
    expect(d.get("c-anna")?.fee_cents).toBe(89);
    expect(d.get("c-barb")?.fee_cents).toBe(1754);
    expect(d.get("c-posto")).toMatchObject({ bucket: "lazer", auto_reason: "regra:POSTO", fee_cents: 978 });
  });

  it("não liga cartão fora da janela (mais de 20% ou mais de 2 dias)", () => {
    const r = runEngine({
      txs: [...pixLegs("x", "LOJA X", 100, "2026-11-01"), card("c-caro", "LOJA X", 130, "2026-11-01"), card("c-tarde", "LOJA X", 105, "2026-11-05")],
      rules: [],
      self,
    });
    expect(r.get("x-out")).toMatchObject({ auto_reason: "pix_no_credito", linked_tx_id: null });
    expect(r.has("c-caro")).toBe(false);
  });

  it("reconhece a mesma pessoa/loja com nomes truncados", () => {
    expect(sameParty("Transferência enviada|BEATRIZ SOUZA LIMA", "Beatriz Souza Lima")).toBe(true);
    expect(sameParty("Transferência enviada|JOAO PEREIRA", "LOJA CONVENIENCIA")).toBe(false);
  });
});

describe("regra 3: pagamento de fatura e transferência própria", () => {
  it("Pix para a instituição do cartão × 'Pagamento recebido' no cartão: ignora os dois", () => {
    const txs = [
      tx({ id: "pix-mp", description: "Transferência enviada pelo Pix|MERCADO PAGO INSTITUICAO", reais: 1075.6, on: "2026-11-05", pluggy_category: "Services" }),
      card("pg-mp", "Pagamento recebido", 1075.6, "2026-11-05", { is_inflow: true, account_id: "card-mp" }),
    ];
    const d = runEngine({ txs, rules: [], self });
    expect(d.get("pix-mp")).toMatchObject({ bucket: "ignorar", auto_reason: "pagamento_fatura", linked_tx_id: "pg-mp" });
    expect(d.get("pg-mp")).toMatchObject({ bucket: "ignorar", auto_reason: "pagamento_fatura" });
  });

  it("descrições de pagamento de fatura na conta são ignoradas mesmo sem o par", () => {
    const d = runEngine({
      txs: [
        tx({ id: "a", description: "PAGAMENTO CARTAO CREDITO BCE", reais: 1495.06, on: "2026-11-05", method: "debito", pluggy_category: "Credit card payment" }),
        tx({ id: "b", description: "Pagamento efetuado - Pagamento Fatura - Cartão", reais: 155.5, on: "2026-11-10", method: "debito", pluggy_category: "Transfers" }),
      ],
      rules: [],
      self,
    });
    expect(d.get("a")?.auto_reason).toBe("pagamento_fatura");
    expect(d.get("b")?.auto_reason).toBe("pagamento_fatura");
  });

  it("Pix para mim mesmo (nome completo, CNPJ ou categoria do banco) = ignorar", () => {
    const d = runEngine({
      txs: [
        tx({ id: "nome", description: "Transferência enviada pelo Pix|FULANO DE TAL SILVA", reais: 500, on: "2026-11-05" }),
        tx({ id: "cnpj", description: "Pix enviado 11.222.333/0001-44", reais: 300, on: "2026-11-05" }),
        tx({ id: "cat", description: "Transferência enviada pelo Pix|Fulano", reais: 1166, on: "2026-11-05", pluggy_category: "Same person transfer" }),
        tx({ id: "outro", description: "Transferência enviada|Fulano Pereira", reais: 20, on: "2026-11-05" }),
      ],
      rules: [],
      self,
    });
    for (const id of ["nome", "cnpj", "cat"]) expect(d.get(id)).toMatchObject({ bucket: "ignorar", auto_reason: "transferencia_propria" });
    expect(d.get("outro")?.auto_reason).not.toBe("transferencia_propria");
  });
});

describe("regra 7: IOF e juros", () => {
  it("herdam o bucket da compra do mesmo cartão (até 2 dias antes)", () => {
    const d = runEngine({
      txs: [
        card("disc", "Discord* Nitro", 30, "2026-11-01"),
        card("iof-disc", 'IOF de "Discord* Nitro"', 1.05, "2026-11-02"),
        card("solo", "IOF DESPESA NO EXTERIOR", 4.11, "2026-11-07", { account_id: "card-outro" }),
      ],
      rules: RULES,
      self,
    });
    expect(d.get("disc")).toMatchObject({ bucket: "fixo", subtype: "assinatura" });
    expect(d.get("iof-disc")).toMatchObject({ bucket: "fixo", auto_reason: "iof_herdado", linked_tx_id: "disc" });
    expect(d.get("solo")).toMatchObject({ bucket: "lazer", auto_reason: "iof_herdado" });
  });
});

describe("regra 9: regras automáticas", () => {
  it("suas regras ganham das padrão; padrão mais longo ganha do mais curto", () => {
    const d = runEngine({
      txs: [card("if", "IFOOD.COM AGENCIA", 146.55, "2026-11-07"), card("club", "IFOOD CLUB", 9.9, "2026-11-07"), card("u", "Dl *Uberrides", 31.93, "2026-11-03")],
      rules: RULES,
      self,
    });
    expect(d.get("if")).toMatchObject({ bucket: "mercado", auto_reason: "regra:IFOOD" });
    expect(d.get("u")).toMatchObject({ bucket: "lazer", auto_reason: "regra:UBER" });
    // "IFOOD CLUB" é padrão e mais longo, mas a regra do usuário "IFOOD" vem primeiro
    expect(d.get("club")?.auto_reason).toBe("regra:IFOOD");
  });

  it("nunca mexe no que você travou nem em lançamento manual", () => {
    const d = runEngine({
      txs: [
        card("lock", "Dl *Uberrides", 10, "2026-11-03", { bucket: "mercado", user_locked: true }),
        tx({ id: "man", description: "Uber", reais: 10, on: "2026-11-03", source: "manual", bucket: "mercado" }),
      ],
      rules: RULES,
      self,
    });
    expect(d.size).toBe(0);
  });

  it("classificado sem motivo e a regra concorda: só registra o motivo; discorda: não mexe", () => {
    const d = runEngine({
      txs: [card("ok", "Dl *Uberrides", 10, "2026-11-03", { bucket: "lazer" }), card("dif", "Dl *Uberrides", 12, "2026-11-04", { bucket: "mercado" })],
      rules: RULES,
      self,
    });
    expect(d.get("ok")).toMatchObject({ bucket: "lazer", auto_reason: "regra:UBER" });
    expect(d.has("dif")).toBe(false);
  });
});

describe("entradas do banco", () => {
  const opts = { self, plannedSalaryCents: 690000, firstMonth: "2026-11-01" };
  const inflow = (id: string, description: string, reais: number, on: string, extra: Partial<EngineTx> = {}) =>
    tx({ id, description, reais, on, is_inflow: true, ...extra });

  it("salário do 1º mês do plano não entra (já tinha sido usado); dos seguintes, sim", () => {
    const r = detectIncomes(
      [inflow("s-nov", "Transferência Recebida|EMPRESA X", 6986.37, "2026-11-05"), inflow("s-dez", "Transferência Recebida|EMPRESA X", 6912, "2026-12-05")],
      opts,
    );
    expect(r).toEqual([expect.objectContaining({ transaction_id: "s-dez", kind: "salario", month: "2026-12-01" })]);
  });

  it("entradas avulsas viram 'Entradas extras'; Pix no crédito, transferência própria e estorno não", () => {
    const r = detectIncomes(
      [
        inflow("extra", "Transferência Recebida|EFICAZ C NATUREZA", 500, "2026-11-11"),
        inflow("mae", "Transferência recebida pelo Pix|MARIA", 130, "2026-11-09"),
        inflow("pixcred", "Valor adicionado na conta por cartão de crédito|Valor", 260, "2026-11-07"),
        inflow("eu", "Transferência recebida|FULANO DE TAL SILVA", 1000, "2026-11-08"),
        inflow("est", "Estorno de compra", 50, "2026-11-08"),
        card("pg", "Pagamento recebido", 155.5, "2026-11-10", { is_inflow: true }),
      ],
      opts,
    );
    expect(r.map((i) => i.transaction_id).sort()).toEqual(["extra", "mae"]);
    expect(r.find((i) => i.transaction_id === "extra")).toMatchObject({ kind: "outro", amount_cents: 50000, description: "EFICAZ C NATUREZA" });
  });
});
