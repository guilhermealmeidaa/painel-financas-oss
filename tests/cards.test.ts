// Regras 4 (fatura paga), 5/6 (cartão ligado, mês de fatura, parcelas futuras) e fatura "real primeiro".
import { describe, expect, it } from "vitest";
import { allocateBySequence, billPayment, coveredSeedInstallments, inferCardDays, invoiceMonth, synthesizeInstallments, type CardTx } from "@/lib/cards";
import { installmentsFromInvoices, invoicesForMonth, prepareInvoices } from "@/lib/invoices";
import { budgets, installments, novTransactions } from "./fixtures";

describe("dias de fechamento e vencimento", () => {
  it("vêm das faturas do banco (dia mais comum)", () => {
    expect(
      inferCardDays([
        { closing_date: "2026-10-08", due_date: "2026-10-15" },
        { closing_date: "2026-09-08", due_date: "2026-09-15" },
        { closing_date: "2026-08-09", due_date: "2026-08-15" },
      ]),
    ).toEqual({ closing_day: 8, due_day: 15 });
  });

  it("mês de fatura respeita o fechamento", () => {
    // fecha dia 8, vence dia 15
    expect(invoiceMonth("2026-11-07", 8, 15)).toBe("2026-11-01");
    expect(invoiceMonth("2026-11-09", 8, 15)).toBe("2026-12-01");
    // fecha dia 28, vence dia 5 do mês seguinte
    expect(invoiceMonth("2026-11-20", 28, 5)).toBe("2026-12-01");
    expect(invoiceMonth("2026-11-29", 28, 5)).toBe("2027-01-01");
    // sem dias: fatura do mês seguinte
    expect(invoiceMonth("2026-11-20", null, null)).toBe("2026-12-01");
  });
});

const ctx = (p: Partial<CardTx> & { id: string; on: string; reais: number }): CardTx => ({
  id: p.id,
  account_id: p.account_id ?? "gold",
  occurred_on: p.on,
  description: p.description ?? "LOJA",
  amount_cents: Math.round(p.reais * 100),
  installment_number: p.installment_number ?? null,
  total_installments: p.total_installments ?? null,
  pluggy_bill_id: p.pluggy_bill_id ?? null,
});

describe("regra 6: parcelas futuras", () => {
  it("calcula as que faltam quando o banco não manda (Cartão Gold/VISA PLUS)", () => {
    const txs = [
      ctx({ id: "a1", on: "2026-09-10", reais: 50, description: "LOJA X 1/4", installment_number: 1, total_installments: 4 }),
      ctx({ id: "a2", on: "2026-10-10", reais: 50, description: "LOJA X 2/4", installment_number: 2, total_installments: 4 }),
    ];
    const v = synthesizeInstallments(txs, (t) => invoiceMonth(t.occurred_on, 8, 15));
    expect(v.map((x) => [x.installment_number, x.invoice_month])).toEqual([
      [3, "2026-12-01"],
      [4, "2027-01-01"],
    ]);
  });

  it("não duplica quando o banco já mandou as futuras (ex.: Nubank/Mercado Pago)", () => {
    const txs = [1, 2, 3].map((n) =>
      ctx({ id: `b${n}`, on: `2026-${String(9 + n).padStart(2, "0")}-05`, reais: 30, description: `VIDEOGAME ${n}/3`, installment_number: n, total_installments: 3 }),
    );
    expect(synthesizeInstallments(txs, (t) => invoiceMonth(t.occurred_on, 1, 10))).toEqual([]);
  });
});

describe("regra 4: fatura paga", () => {
  it("pagamento(s) no cartão entre fechamento e vencimento cobrem a fatura", () => {
    const bill = { total_cents: 150000, due_date: "2026-11-05", closing_date: "2026-10-27" };
    expect(billPayment(bill, [{ id: "p", occurred_on: "2026-11-05", amount_cents: 150000 }])).toMatchObject({ paid: true, payment_tx_id: "p" });
    expect(billPayment(bill, [{ id: "p", occurred_on: "2026-11-05", amount_cents: 100000 }]).paid).toBe(false);
    // pagamento em duas vezes também vale
    expect(
      billPayment(bill, [
        { id: "p1", occurred_on: "2026-10-30", amount_cents: 50000 },
        { id: "p2", occurred_on: "2026-11-04", amount_cents: 100000 },
      ]).paid,
    ).toBe(true);
    // pagamento de outro ciclo não conta
    expect(billPayment(bill, [{ id: "x", occurred_on: "2026-10-01", amount_cents: 150000 }]).paid).toBe(false);
  });
});

describe("compras do plano já cobertas pelo banco", () => {
  it("Videogame 4x de 137,48 do plano = parcela 1/4 de 137,48 no cartão", () => {
    const m = coveredSeedInstallments(
      [
        { id: "game", installment_cents: 13748, installments_count: 4, first_invoice_month: "2026-12-01", status: "ativa" },
        { id: "presente", installment_cents: 4167, installments_count: 12, first_invoice_month: "2027-01-01", status: "planejada" },
      ],
      [{ ...ctx({ id: "bank-game", on: "2026-11-10", reais: 137.48, installment_number: 1, total_installments: 4 }), invoice_month: "2026-12-01" }],
    );
    expect([...m.entries()]).toEqual([["game", "bank-game"]]);
  });
});


describe("fatura real primeiro (correção de 12/11)", () => {
  const cards = [
    { id: "nu", name: "Nubank", pluggy_account_id: "pl-1", closing_day: 8, due_day: 15 },
    { id: "inter", name: "Inter" },
  ];
  const fixed = [
    { month: "2026-12-01", name: "Cartão Nubank", category: "cartao", account_id: "nu", amount_cents: 108000 },
    { month: "2026-12-01", name: "Cartão Inter", category: "cartao", account_id: "inter", amount_cents: 72900 },
  ];
  const inst = installments.map((i, n) => ({ ...i, id: `seed${n}`, name: `p${n}`, account_id: null }));
  const bank = [
    { id: "c1", occurred_on: "2026-11-10", amount_cents: 12000, method: "credito" as const, bucket: "lazer" as const, account_id: "nu", description: "BARBEARIA" },
    { id: "c2", occurred_on: "2026-11-10", amount_cents: 4900, method: "credito" as const, bucket: "parcela" as const, account_id: "nu", description: "ROUPAS 1/4", installment_number: 1, total_installments: 4 },
  ];
  const txs = [...novTransactions.map((t) => ({ ...t, account_id: null, source: "manual" })), ...bank];
  const base = { cards, fixed, installments: inst, transactions: txs, budgets };

  it("regra 2: com banco conectado, cartão cadastrado NÃO ligado não soma estimativa: vira alerta", () => {
    const r = invoicesForMonth({ ...base, month: "2026-12-01" });
    expect(r.cards.find((c) => c.accountId === "nu")?.total).toBe(12000 + 4900);
    expect(r.cards.find((c) => c.accountId === "inter")).toBeUndefined();
    expect(r.unlinkedSeedCards).toEqual(["Inter"]);
  });

  it("compra do plano coberta pelo banco não entra de novo; não encontrada vira alerta (fora do total)", () => {
    const r = invoicesForMonth({ ...base, month: "2026-12-01" });
    expect(r.cards.find((c) => c.accountId === null)).toBeUndefined(); // "Cartão não informado" vazio
    expect([...r.seedNotFound].sort()).toEqual(["p1", "p2"]); // jaqueta e videogame; roupas (p0) estão no banco
  });

  it("fatura fechada: vale a soma das compras ligadas a ela, não o total da Pluggy (que é saldo)", () => {
    const linkedTx = [
      { id: "b1", occurred_on: "2026-11-01", amount_cents: 200000, method: "credito" as const, bucket: "lazer" as const, account_id: "nu", description: "X", pluggy_bill_id: "bill-nov" },
      { id: "b2", occurred_on: "2026-11-03", amount_cents: 40991, method: "credito" as const, bucket: "lazer" as const, account_id: "nu", description: "Y", pluggy_bill_id: "bill-nov" },
    ];
    const r = invoicesForMonth({
      ...base,
      transactions: linkedTx,
      month: "2026-11-01",
      realBills: [{ account_id: "nu", due_date: "2026-11-15", total_cents: 15550, pluggy_bill_id: "bill-nov" }],
    });
    expect(r.cards.find((c) => c.accountId === "nu")).toMatchObject({ total: 240991, real: true });
    // sem compra ligada: usa o valor que a Pluggy informou
    const r2 = invoicesForMonth({ ...base, transactions: [], month: "2026-11-01", realBills: [{ account_id: "nu", due_date: "2026-11-15", total_cents: 15550 }] });
    expect(r2.cards.find((c) => c.accountId === "nu")).toMatchObject({ total: 15550, real: true });
  });

  it("regra 5: reserva do teto separada como estimativa e some quando o mês fecha", () => {
    const during = invoicesForMonth({ ...base, month: "2026-12-01", today: "2026-11-12" });
    const after = invoicesForMonth({ ...base, month: "2026-12-01", today: "2026-12-02" });
    expect(during.cards.find((c) => c.accountId === "reserva")).toMatchObject({ total: 150000 - 12000, estimate: true });
    expect(after.cards.find((c) => c.accountId === "reserva")).toBeUndefined();
  });
});

describe("regra 3: parcelas sem dobrar", () => {
  const mpCard = [{ id: "mp", name: "Mercado Pago", pluggy_account_id: "pl-mp", closing_day: 8, due_day: 13 }];
  const p = (id: string, on: string, n: number, extra: Record<string, unknown> = {}) => ({
    id,
    occurred_on: on,
    amount_cents: 1881,
    method: "credito" as const,
    bucket: "parcela" as const,
    account_id: "mp",
    description: "MP*MP",
    installment_number: n,
    total_installments: 12,
    pluggy_bill_id: null as string | null,
    ...extra,
  });

  it("(c) parcela n datada no dia da compra (09/11) e n+1 no dia padrão (04/12) não caem na mesma fatura", () => {
    // caso real: as duas datas estão na janela 09/11–08/12 da fatura de dezembro
    const txs = [p("n2", "2026-11-09", 2), p("n3", "2026-12-04", 3), p("n4", "2027-01-04", 4)];
    const inputs = { cards: mpCard, fixed: [], installments: [], transactions: txs, budgets: [], today: "2026-11-12" };
    const prep = prepareInvoices(inputs);
    const perMonth = ["2026-12-01", "2027-01-01", "2027-02-01"].map((m) => invoicesForMonth({ ...inputs, month: m }, prep).total);
    expect(perMonth).toEqual([1881, 1881, 1881]);
  });

  it("(a) cartão que manda parcelas futuras não recebe parcelas calculadas", () => {
    const txs = [p("n2", "2026-11-04", 2), p("n3", "2026-12-04", 3)];
    const prep = prepareInvoices({ cards: mpCard, fixed: [], installments: [], transactions: txs, budgets: [], today: "2026-11-12" });
    expect(prep.virtual).toEqual([]);
  });

  it("(b) n = total não gera parcela futura", () => {
    const v = synthesizeInstallments(
      [ctx({ id: "x", on: "2026-11-10", reais: 50, description: "LOJA 4/4", installment_number: 4, total_installments: 4 })],
      () => "2026-12-01",
    );
    expect(v).toEqual([]);
  });

  it("soma por mês de fatura bate com as faturas fechadas (compras ligadas pelo bill id)", () => {
    const rows = [
      p("a1", "2026-09-09", 1, { pluggy_bill_id: "oct" }),
      p("a2", "2026-10-04", 2, { pluggy_bill_id: "nov" }),
      p("a3", "2026-11-09", 3),
      p("b1", "2026-09-20", 1, { pluggy_bill_id: "oct", description: "LOJA B", amount_cents: 5000, total_installments: 3 }),
      p("b2", "2026-10-04", 2, { pluggy_bill_id: "nov", description: "LOJA B", amount_cents: 5000, total_installments: 3 }),
      { id: "v1", occurred_on: "2026-10-01", amount_cents: 3000, method: "credito" as const, bucket: "lazer" as const, account_id: "mp", description: "AVISTA", pluggy_bill_id: "oct" },
    ];
    const bills = [
      { account_id: "mp", due_date: "2026-10-13", total_cents: 0, pluggy_bill_id: "oct" },
      { account_id: "mp", due_date: "2026-11-13", total_cents: 0, pluggy_bill_id: "nov" },
    ];
    const inputs = { cards: mpCard, fixed: [], installments: [], transactions: rows, budgets: [], realBills: bills, today: "2026-11-12" };
    const prep = prepareInvoices(inputs);
    const linked = (bill: string) => rows.filter((r) => r.pluggy_bill_id === bill).reduce((s, r) => s + r.amount_cents, 0);
    expect(invoicesForMonth({ ...inputs, month: "2026-10-01" }, prep).total).toBe(linked("oct"));
    expect(invoicesForMonth({ ...inputs, month: "2026-11-01" }, prep).total).toBe(linked("nov"));
    // dezembro: parcela 3/12 de A (banco) + parcela 3/3 de B calculada (o banco não mandou futuras aqui)
    expect(invoicesForMonth({ ...inputs, month: "2026-12-01" }, prep).total).toBe(1881 + 5000);
  });
});

describe("regra 1: assinaturas projetadas", () => {
  it("média dos 2 últimos débitos nos meses de fatura sem cobrança real", () => {
    const cards = [{ id: "nu", name: "Nubank", pluggy_account_id: "pl", closing_day: 8, due_day: 15 }];
    const sub = (id: string, on: string, cents: number) => ({
      id,
      occurred_on: on,
      amount_cents: cents,
      method: "credito" as const,
      bucket: "assinatura" as const,
      account_id: "nu",
      description: "Microsoft*Microsoft 365 P",
      auto_reason: "regra:MICROSOFT",
    });
    const inputs = { cards, fixed: [], installments: [], transactions: [sub("s1", "2026-10-09", 4900), sub("s2", "2026-11-09", 5100)], budgets: [], today: "2026-11-12" };
    const prep = prepareInvoices(inputs);
    // 09/11 cai na fatura de dez (fecha 08); jan e fev: projetada pela média (49 + 51) / 2 = 50
    expect(invoicesForMonth({ ...inputs, month: "2026-12-01" }, prep).total).toBe(5100);
    expect(invoicesForMonth({ ...inputs, month: "2027-01-01" }, prep).total).toBe(5000);
    expect(invoicesForMonth({ ...inputs, month: "2027-02-01" }, prep).total).toBe(5000);
  });
});

describe("parcelas do plano até casar com o banco", () => {
  const cards = [
    { id: "plat", name: "platinum", pluggy_account_id: "pl-1", closing_day: 7, due_day: 14 },
    { id: "mp", name: "Mercado Pago", pluggy_account_id: "pl-2", closing_day: 8, due_day: 13 },
  ];
  const seed = [
    { id: "roupas", name: "Roupas de viagem", installment_cents: 4900, installments_count: 4, first_invoice_month: "2026-12-01", status: "ativa" as const, account_id: null, purchase_date: "2026-11-09" },
    { id: "jaqueta", name: "Jaqueta de inverno", installment_cents: 1870, installments_count: 12, first_invoice_month: "2026-12-01", status: "ativa" as const, account_id: null, purchase_date: "2026-11-09" },
    { id: "game", name: "Videogame", installment_cents: 13748, installments_count: 4, first_invoice_month: "2026-12-01", status: "ativa" as const, account_id: null, purchase_date: "2026-11-10" },
  ];
  const bank = [
    // parcela 2 de uma compra de ~09/10: valor parecido com a jaqueta, mas NÃO é ela
    { id: "mpmp", occurred_on: "2026-11-09", amount_cents: 1881, method: "credito" as const, bucket: "parcela" as const, account_id: "mp", description: "MP*MP", installment_number: 2, total_installments: 12 },
    // esta é: 1/12, mesma data, 18,78 × 18,70 (+0,4%)
    { id: "loja", occurred_on: "2026-11-09", amount_cents: 1878, method: "credito" as const, bucket: "parcela" as const, account_id: "plat", description: "LOJA ONLINE *LOJA ONLINE.Com 1/12", installment_number: 1, total_installments: 12 },
  ];
  const inputs = { cards, fixed: [], installments: seed, transactions: bank, budgets: [], today: "2026-11-12" };

  it("casa por valor ±2%, nº de parcelas e data de compra ±3 dias (LOJA ONLINE 1/12, não MP*MP 2/12)", () => {
    const prep = prepareInvoices(inputs);
    expect([...prep.covered.entries()]).toEqual([["jaqueta", "loja"]]);
  });

  it("sem par no banco, continua na fatura numa linha 'cartão a confirmar'", () => {
    const r = invoicesForMonth({ ...inputs, month: "2026-12-01" });
    const plano = r.cards.find((c) => c.accountId === "plano");
    expect(plano?.name).toBe("Parcelas do plano (cartão a confirmar)");
    expect(plano?.total).toBe(4900 + 13748);
    expect(plano?.lines.map((l) => l.label).sort()).toEqual(["Parcelas do plano — Roupas de viagem", "Parcelas do plano — Videogame"]);
    // a jaqueta não entra de novo: já está no platinum como loja online
    expect(r.cards.some((c) => c.lines.some((l) => l.label.includes("Jaqueta")))).toBe(false);
    expect(installmentsFromInvoices(r)).toBe(1878 + 1881 + 4900 + 13748);
  });

  it("com cartão informado, a parcela do plano entra na fatura dele", () => {
    const r = invoicesForMonth({ ...inputs, installments: [{ ...seed[2], account_id: "plat" }], month: "2026-12-01" });
    expect(r.cards.find((c) => c.accountId === "plat")?.lines.map((l) => l.label)).toContain("Parcelas do plano — Videogame");
    expect(r.cards.find((c) => c.accountId === "plano")).toBeUndefined();
  });
});

describe("item 8: compra pendente fora da fatura já fechada", () => {
  // platinum fecha dia 7, vence 14; a fatura de novembro já fechou no banco
  const cards = [{ id: "plat", name: "platinum", pluggy_account_id: "pl", closing_day: 7, due_day: 14 }];
  const realBills = [{ account_id: "plat", due_date: "2026-11-15", total_cents: 15550, pluggy_bill_id: "bill-nov" }];
  const tx = (id: string, on: string, cents: number, extra: Record<string, unknown> = {}) => ({
    id,
    occurred_on: on,
    amount_cents: cents,
    method: "credito" as const,
    bucket: "lazer" as const,
    account_id: "plat",
    description: id,
    ...extra,
  });
  const txs = [
    tx("uber-0511", "2026-11-05", 895, { pluggy_bill_id: "bill-nov", pluggy_status: "POSTED" }), // entrou na fatura de nov
    tx("pix-barbearia", "2026-11-06", 12354, { pluggy_status: "PENDING" }), // Pix no crédito: não entrou
    tx("pix-petshop", "2026-11-07", 27502, { pluggy_status: "PENDING" }),
    tx("posto-0811", "2026-11-08", 7215, { pluggy_status: "PENDING" }), // depois do fechamento: dez pela data
  ];
  const inputs = { cards, fixed: [], installments: [], transactions: txs, budgets: [], realBills, today: "2026-11-12" };

  it("pendente sem bill id, com a fatura da data já fechada, vai para a próxima fatura", () => {
    const prep = prepareInvoices(inputs);
    const month = Object.fromEntries(prep.withMonth.map((t) => [t.id, t.invoice_month]));
    expect(month["uber-0511"]).toBe("2026-11-01");
    expect(month["pix-barbearia"]).toBe("2026-12-01");
    expect(month["pix-petshop"]).toBe("2026-12-01");
    expect(month["posto-0811"]).toBe("2026-12-01");
    expect(invoicesForMonth({ ...inputs, month: "2026-12-01" }, prep).total).toBe(12354 + 27502 + 7215);
  });

  it("sem fatura fechada no banco, continua pela data", () => {
    const prep = prepareInvoices({ ...inputs, realBills: [] });
    expect(prep.withMonth.find((t) => t.id === "pix-barbearia")?.invoice_month).toBe("2026-11-01");
  });
});

describe("Pix parcelado com valor diferente a cada mês é uma compra só", () => {
  it("FARMACIA EXEMPLO 3/8, 4/8, 5/8 com valores 24,24 / 26,91 / 29,86 projeta 6/8, 7/8, 8/8 uma vez cada", () => {
    const rows = [
      ctx({ id: "r3", on: "2026-08-18", reais: 24.24, description: "PIX CRED PARC FARMACIA EXEMPLO SA", installment_number: 3, total_installments: 8 }),
      ctx({ id: "r4", on: "2026-09-16", reais: 26.91, description: "PIX CRED PARC FARMACIA EXEMPLO SA", installment_number: 4, total_installments: 8 }),
      ctx({ id: "r5", on: "2026-10-16", reais: 29.86, description: "PIX CRED PARC FARMACIA EXEMPLO SA", installment_number: 5, total_installments: 8 }),
    ];
    const v = synthesizeInstallments(rows, (t) => invoiceMonth(t.occurred_on, 7, 14));
    expect(v.map((x) => x.installment_number)).toEqual([6, 7, 8]);
    expect(v.every((x) => x.amount_cents === 2986)).toBe(true);
  });

  it("duas compras iguais em meses diferentes continuam separadas", () => {
    const rows = [
      ctx({ id: "a", on: "2026-10-16", reais: 20, description: "PIX CRED PARC IFOOD", installment_number: 2, total_installments: 4 }), // compra de set
      ctx({ id: "b", on: "2026-10-16", reais: 20, description: "PIX CRED PARC IFOOD", installment_number: 1, total_installments: 4 }), // compra de out
    ];
    const v = synthesizeInstallments(rows, (t) => invoiceMonth(t.occurred_on, 7, 14));
    expect(v.length).toBe(2 + 3);
  });
});

describe("VISA PLUS: parcela 1 na data da compra, as outras na data da fatura", () => {
  it("IFD*KRC 6x (1@15/08, 2@31/08, 3@28/09, 4@28/10) é uma compra só: projeta 5/6 e 6/6", () => {
    const d = "IFD*LANCHONETE EXEMPLO";
    const rows = [
      ctx({ id: "k1", on: "2026-08-15", reais: 46.62, description: `${d} 1/6`, installment_number: 1, total_installments: 6, account_id: "fv" }),
      ctx({ id: "k2", on: "2026-08-31", reais: 46.61, description: `${d} 2/6`, installment_number: 2, total_installments: 6, account_id: "fv" }),
      ctx({ id: "k3", on: "2026-09-28", reais: 46.61, description: `${d} 3/6`, installment_number: 3, total_installments: 6, account_id: "fv" }),
      ctx({ id: "k4", on: "2026-10-28", reais: 46.61, description: `${d} 4/6`, installment_number: 4, total_installments: 6, account_id: "fv" }),
    ];
    const v = synthesizeInstallments(rows, (t) => invoiceMonth(t.occurred_on, 27, 4));
    // fecha dia 27: a parcela 4 (28/10) já é da fatura de dez; 5/6 e 6/6 vão para jan e fev
    expect(v.map((x) => [x.installment_number, x.invoice_month])).toEqual([
      [5, "2027-01-01"],
      [6, "2027-02-01"],
    ]);
  });
});

describe("antecipação de parcelas", () => {
  it("AMAZON 2/10…10/10 lançadas no mesmo dia: compra encerrada, nada a projetar", () => {
    const d = "AMAZON RETAIL BR CPI";
    const rows = [ctx({ id: "a1", on: "2026-09-10", reais: 7.06, description: d, installment_number: 1, total_installments: 10 })];
    for (let n = 2; n <= 10; n++) rows.push(ctx({ id: `a${n}`, on: "2026-09-16", reais: 7.02, description: d, installment_number: n, total_installments: 10 }));
    const v = synthesizeInstallments(rows, (t) => invoiceMonth(t.occurred_on, 7, 14));
    expect(v).toEqual([]);
  });
});

describe("antecipação: mês de fatura", () => {
  it("2/10…10/10 lançadas em 11/09 ficam todas na fatura daquele dia", () => {
    const d = "AMAZON RETAIL BR CPI";
    const rows = [ctx({ id: "b1", on: "2026-09-07", reais: 29.69, description: d, installment_number: 1, total_installments: 10 })];
    for (let n = 2; n <= 10; n++) rows.push(ctx({ id: `b${n}`, on: "2026-09-11", reais: 29.64, description: d, installment_number: n, total_installments: 10 }));
    const m = allocateBySequence(rows, (t) => invoiceMonth(t.occurred_on, 27, 4), () => false);
    expect(new Set([...m.values()])).toEqual(new Set(["2026-10-01"]));
  });
});
