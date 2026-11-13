import { describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor, incomesReport, subscriptionStats, upcomingDue } from "@/lib/mcp/phase2";

vi.mock("server-only", () => ({}));

describe("proximos_vencimentos", () => {
  it("fatura de 40,00 em 15/11 com saldo 25,00: não cobre, faltam 15,00", () => {
    const r = upcomingDue({
      today: "2026-11-12",
      days: 7,
      balanceCents: 2500,
      items: [
        { name: "Fatura Cartão B", cents: 4000, due: "2026-11-15", autoDebit: false, kind: "fatura" },
        { name: "Internet", cents: 20000, due: null, autoDebit: false, kind: "conta" },
        { name: "Luz", cents: 54200, due: "2026-11-25", autoDebit: true, kind: "conta" }, // fora da janela
      ],
      incomes: [],
    });
    expect(r.vencimentos).toHaveLength(1);
    expect(r.vencimentos[0]).toMatchObject({ nome: "Fatura Cartão B", saldo_cobre: false, falta: 15 });
    expect(r.sem_data_conhecida.map((x) => x.nome)).toEqual(["Internet"]);
  });

  it("entrada prevista antes do vencimento entra no saldo; vencimentos anteriores saem dele", () => {
    const r = upcomingDue({
      today: "2026-12-01",
      days: 10,
      balanceCents: 10000,
      items: [
        { name: "A", cents: 8000, due: "2026-12-03", autoDebit: false, kind: "conta" },
        { name: "B", cents: 5000, due: "2026-12-08", autoDebit: true, kind: "conta" },
      ],
      incomes: [{ description: "Salário", cents: 500000, date: "2026-12-05" }],
    });
    expect(r.vencimentos.map((v) => [v.nome, v.saldo_cobre, v.disponivel_na_data])).toEqual([
      ["A", true, 100],
      ["B", true, 5020],
    ]);
  });
});

describe("assinaturas: todos os buckets, comerciante unificado, separa por valor só em paralelo", () => {
  let n = 0;
  const c = (on: string, desc: string, reais: number, bucket = "ignorar", extra: Record<string, unknown> = {}) => ({
    id: `s${++n}`,
    occurred_on: on,
    description: desc,
    amount_cents: Math.round(reais * 100),
    account: "Cartão",
    auto_reason: null,
    bucket,
    is_inflow: false,
    total_installments: null,
    ...extra,
  });
  const charges = [
    // Spotify escrito de 3 jeitos
    c("2026-08-26", "Dm *Spotify", 40.9), c("2026-09-26", "Dm*Spotify P4753", 40.9), c("2026-10-26", "Dl*Spotify P487a", 40.9),
    // Apple: 19,90 e 34,90 em paralelo = 2 assinaturas; 31,90 avulsa
    c("2026-09-02", "APPLE.COM/BILL SAO PAULO BRA", 19.9), c("2026-09-05", "APPLE.COM/BILL SAO PAULO BRA", 34.9), c("2026-09-11", "Apple.Com/Bill", 31.9),
    c("2026-10-02", "APPLE.COM/BILL SAO PAULO BRA", 19.9), c("2026-10-05", "APPLE.COM/BILL SAO PAULO BRA", 34.9),
    c("2026-11-02", "APPLE.COM/BILL SAO PAULO BRA", 19.9, "assinatura"), c("2026-11-07", "APPLE.COM/BILL SAO PAULO BRA", 34.9, "assinatura"),
    // X: subiu de preço
    c("2026-09-10", "X Corp. Paid Features", 9.9), c("2026-10-10", "X Corp. Paid Features", 9.9), c("2026-11-10", "X Corp. Paid Features", 14.9, "assinatura"),
    // Claude: cobrança do banco + lançamento manual juntado (bucket lazer)
    c("2026-10-06", "ANTHROPIC* CLAUDE SUB", 110, "lazer"), c("2026-11-07", "Assinatura Claude", 110, "lazer"),
    // Amazon Prime e add-ons
    c("2026-09-18", "Amazonprimebr", 19.9), c("2026-10-18", "Amazonprimebr", 19.9), c("2026-10-01", "Amazon Prime Canais", 34.9), c("2026-11-01", "Amazon Prime Canais", 34.9, "assinatura"),
    // fora: IOF, parcela (Globoplay 9/12), entrada e Pix
    c("2026-10-14", 'IOF de "Discord* Nitromonthly"', 0.91), c("2026-10-08", "Globo Globoplay 9/12", 22.9, "parcela", { total_installments: 12 }),
    c("2026-10-10", "Transferência enviada|Fulano", 50, "lazer"),
    // desconhecido que se repete 3 meses seguidos com o mesmo valor
    c("2026-08-20", "CLUBE DO LIVRO", 29.9), c("2026-09-20", "CLUBE DO LIVRO", 29.9), c("2026-10-20", "CLUBE DO LIVRO", 29.9),
    // corridas com valor parecido 3 meses seguidos, mas em dias diferentes: NÃO é assinatura
    c("2026-08-02", "Dl *Uberrides", 31.93), c("2026-09-21", "Dl *Uberrides", 31.9), c("2026-10-11", "Dl *Uberrides", 32),
    // Discord: câmbio mexe 1,6%; não é aumento
    c("2026-09-12", "Discord* Nitromonthly", 4.91), c("2026-10-13", "Discord* Nitromonthly", 4.99),
    // desconhecido que aparece 2 vezes: NÃO é assinatura
    c("2026-09-03", "PADARIA CENTRAL", 12), c("2026-10-03", "PADARIA CENTRAL", 12),
  ];
  const r = subscriptionStats(charges, "2026-11-12");
  const names = r.assinaturas.map((a) => a.nome).sort();

  it("lista as esperadas", () => {
    expect(names).toEqual(["Amazon Prime", "Amazon Prime Canais", "Apple 19,90", "Apple 34,90", "CLUBE DO LIVRO", "Claude", "Discord Nitro", "Spotify", "X"].sort());
    expect(r.aumentaram).toEqual(["X"]);
  });
  it("Spotify unificado; Claude junta banco + manual juntado", () => {
    expect(r.assinaturas.find((a) => a.nome === "Spotify")).toMatchObject({ cobrancas: 3, frequencia: "mensal" });
    expect(r.assinaturas.find((a) => a.nome === "Claude")).toMatchObject({ cobrancas: 2, frequencia: "mensal" });
  });
  it("Apple 31,90 fica como avulsa; X aumentou de preço", () => {
    const apple = r.assinaturas.filter((a) => a.nome.startsWith("Apple"));
    expect(apple.flatMap((a) => ("avulsas" in a ? a.avulsas!.map((x) => x.valor) : []))).toEqual([31.9]);
    expect(r.assinaturas.find((a) => a.nome === "X")).toMatchObject({ aumentou: true, valor_anterior: 9.9, ultimo_valor: 14.9 });
    expect(r.aumentaram).toContain("X");
  });
});

describe("entradas", () => {
  it("prevista recebida (±5%), pendente e avulsa não confirmada", () => {
    const r = incomesReport(
      [
        { id: "p1", description: "Salário líquido", amount_cents: 500000, kind: "salario", source: "manual", status: "confirmada", transaction_id: null },
        { id: "p2", description: "13º", amount_cents: 200000, kind: "13o", source: "manual", status: "confirmada", transaction_id: null },
        { id: "b1", description: "SALARIO", amount_cents: 498000, kind: "salario", source: "banco", status: "confirmada", transaction_id: "t1" },
        { id: "b2", description: "PIX RECEBIDO", amount_cents: 17073, kind: "outro", source: "banco", status: "auto", transaction_id: "t2" },
      ],
      (id) => (id === "t1" ? "2026-12-05" : id === "t2" ? "2026-12-09" : null),
    );
    expect(r.previstas.map((p) => [p.descricao, p.status])).toEqual([
      ["Salário líquido", "recebida"],
      ["13º", "pendente"],
    ]);
    expect(r.previstas[0]).toMatchObject({ recebida_em: "2026-12-05", valor_recebido: 4980 });
    expect(r.falta_receber).toBe(2000);
    expect(r.avulsas_nao_confirmadas.map((a) => a.id)).toEqual(["b2"]);
  });
});

describe("paginação de transacoes", () => {
  it("cursor vai e volta; lixo vira início", () => {
    expect(decodeCursor(encodeCursor(300))).toBe(300);
    expect(decodeCursor("xyz")).toBe(0);
    expect(decodeCursor(undefined)).toBe(0);
  });
});

describe("simular_compra reproduz a compra parcelada que já está na projeção", () => {
  it("599,90 em 4× no Cartão B, sobre os dados SEM a compra, dá a mesma projeção que os dados COM ela", async () => {
    const { simulatePurchase } = await import("@/lib/simulate");
    const { runProjection } = await import("@/lib/data");
    const M = (m: string) => `${m}-01`;
    const cartaoB = { id: "cb", user_id: "u", name: "Cartão B", kind: "credit_card", closing_day: 7, due_day: 14, pluggy_account_id: "p-in", pluggy_item_id: "it", balance_cents: null, synced_at: null };
    const conta = { id: "cc", user_id: "u", name: "Conta", kind: "checking", closing_day: null, due_day: null, pluggy_account_id: "p-cc", pluggy_item_id: "it", balance_cents: 200000, synced_at: null };
    const months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
    const base = {
      settings: { projection_start: M("2026-11"), opening_balance_cents: 0, self_names: [], self_tax_ids: [] },
      accounts: [cartaoB, conta],
      incomes: months.map((m, i) => ({ id: `i${i}`, month: M(m), amount_cents: 500000, description: "Salário", kind: "salario", source: "manual", status: "confirmada", transaction_id: null })),
      fixed: months.map((m, i) => ({ id: `f${i}`, month: M(m), name: "Aluguel", category: "conta", account_id: null, amount_cents: 200000, match_pattern: null })),
      installments: [] as Record<string, unknown>[],
      budgets: months.map((m, i) => ({ id: `b${i}`, month: M(m), method: "debito_pix", cap_cents: 150000, control_start: null, skipped_weekends: [], allocations: [] })),
      transactions: [] as Record<string, unknown>[],
      payments: [],
      dismissedPayments: [],
      cardBills: [],
      email: "",
    };
    const compra = { id: "vg", name: "Videogame", total_cents: 59990, installments_count: 4, installment_cents: 14998, first_invoice_month: M("2026-12"), account_id: "cb", status: "ativa", purchase_date: "2026-11-10", covered_by_bank: false, matched_tx_id: null };
    const withPurchase = runProjection({ ...base, installments: [compra] } as never);
    const sim = simulatePurchase(base as never, { totalCents: 59990, parcelas: 4, cardId: "cb", date: "2026-11-10", bucket: "parcela", today: "2026-11-12" });
    expect(sim.faturas_afetadas.map((f) => f.fatura)).toEqual(["2026-12", "2027-01", "2027-02", "2027-03"]);
    for (const row of withPurchase) {
      const s = sim.projecao.find((p) => p.mes === row.month.slice(0, 7))!;
      // a compra cadastrada é 4 × 149,98; a simulação arredonda 599,90/4 para 149,98 também
      expect(Math.round(s.saldo_depois * 100)).toBe(row.balance);
    }
    expect(sim.projecao.find((p) => p.mes === "2026-12")?.diferenca).toBe(-149.98);
    expect(sim.projecao.find((p) => p.mes === "2026-11")?.diferenca).toBe(0);
  });
});

describe("simular_compra à vista: dentro do teto só muda o 'ainda posso gastar'", () => {
  const M = (m: string) => `${m}-01`;
  const months = ["2026-11", "2026-12", "2027-01"];
  const nu = { id: "nu", user_id: "u", name: "Cartão A", kind: "credit_card", closing_day: 7, due_day: 14, pluggy_account_id: "p", pluggy_item_id: "it", balance_cents: null, synced_at: null };
  const cc = { id: "cc", user_id: "u", name: "Conta", kind: "checking", closing_day: null, due_day: null, pluggy_account_id: "p2", pluggy_item_id: "it", balance_cents: 200000, synced_at: null };
  // nov no crédito com teto 1.500 e 900,00 já gastos (sobram 600,00)
  const spent = { id: "g", occurred_on: "2026-11-06", description: "GASTOS", amount_cents: 90000, account_id: "nu", method: "credito", bucket: "lazer", source: "pluggy", is_inflow: false, external_id: "x", superseded: false, pluggy_status: "POSTED" };
  const data = {
    settings: { projection_start: M("2026-11"), opening_balance_cents: 0, self_names: [], self_tax_ids: [] },
    accounts: [nu, cc],
    incomes: months.map((m, i) => ({ id: `i${i}`, month: M(m), amount_cents: 500000, description: "Salário", kind: "salario", source: "manual", status: "confirmada", transaction_id: null })),
    fixed: [],
    installments: [],
    budgets: [
      { id: "b0", month: M("2026-11"), method: "credito", cap_cents: 150000, control_start: "2026-11-05", skipped_weekends: [], allocations: [{ bucket: "lazer", amount_cents: 100000 }, { bucket: "mercado", amount_cents: 50000 }] },
      { id: "b1", month: M("2026-12"), method: "debito_pix", cap_cents: 150000, control_start: null, skipped_weekends: [], allocations: [] },
      { id: "b2", month: M("2027-01"), method: "debito_pix", cap_cents: 150000, control_start: null, skipped_weekends: [], allocations: [] },
    ],
    transactions: [spent],
    payments: [],
    dismissedPayments: [],
    cardBills: [],
    email: "",
  };

  it("80 de lazer em nov: 600,00 → 520,00 e projeção inalterada (meio padrão = crédito)", async () => {
    const { simulatePurchase } = await import("@/lib/simulate");
    const r = simulatePurchase(data as never, { totalCents: 8000, parcelas: 1, cardId: null, date: "2026-11-12", bucket: "lazer", today: "2026-11-12" });
    expect(r.compra.meio).toBe("crédito");
    expect(r.dia_a_dia_do_mes).toMatchObject({ ainda_posso_gastar_antes: 600, ainda_posso_gastar_depois: 520 });
    expect(r.projecao.every((p) => p.diferenca === 0)).toBe(true);
  });

  it("passando do teto, só o excedente sai da projeção, na fatura seguinte (crédito)", async () => {
    const { simulatePurchase } = await import("@/lib/simulate");
    const r = simulatePurchase(data as never, { totalCents: 70000, parcelas: 1, cardId: null, date: "2026-11-12", bucket: "lazer", today: "2026-11-12" });
    // 600,00 cabem; 100,00 passam do teto e saem em dezembro
    expect(r.dia_a_dia_do_mes).toMatchObject({ passa_do_teto_em: 100 });
    expect(r.projecao.find((p) => p.mes === "2026-11")?.diferenca).toBe(0);
    expect(r.projecao.find((p) => p.mes === "2026-12")?.diferenca).toBe(-100);
    expect(r.projecao.find((p) => p.mes === "2027-01")?.diferenca).toBe(-100);
  });

  it("fora do dia a dia (assinatura) conta inteiro", async () => {
    const { simulatePurchase } = await import("@/lib/simulate");
    const r = simulatePurchase(data as never, { totalCents: 5000, parcelas: 1, cardId: "nu", date: "2026-11-12", bucket: "assinatura", today: "2026-11-12" });
    expect(r.projecao.find((p) => p.mes === "2026-12")?.diferenca).toBe(-50);
  });
});
