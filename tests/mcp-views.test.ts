import { describe, expect, it } from "vitest";
import { monthStatus } from "@/lib/budget";
import { billsForMonth } from "@/lib/bills";
import { invoicesForMonth } from "@/lib/invoices";
import { dailyDetail, healthReport, invoiceDetail } from "@/lib/mcp/views";
import { BUCKET_LABEL } from "@/lib/labels";

const NOV = "2026-11-01";
const tx = (id: string, on: string, reais: number, bucket: string, extra: Record<string, unknown> = {}) => ({
  id,
  occurred_on: on,
  description: `Compra ${id}`,
  amount_cents: Math.round(reais * 100),
  bucket: bucket as "lazer",
  method: "credito" as const,
  account_id: "ca",
  source: "pluggy",
  ...extra,
});

// casos que já deram diferença entre o resumo e listas "na mão": antes do início do controle,
// data futura (parcela), outro mês, bucket fora do dia a dia, manual e débito
const transactions = [
  tx("a", "2026-11-03", 45.09, "lazer"), // antes do início do controle (05/11): NÃO conta
  tx("b", "2026-11-05", 100, "lazer"),
  tx("c", "2026-11-07", 161, "mercado"),
  tx("d", "2026-11-10", 23.22, "mercado", { method: "pix", account_id: null }),
  tx("e", "2026-11-11", 50, "lazer", { source: "manual" }),
  tx("f", "2026-11-20", 80, "lazer"), // depois de hoje (12/11): ainda não conta
  tx("g", "2026-11-08", 300, "parcela"),
  tx("h", "2026-11-09", 12, "sem_categoria"),
  tx("i", "2026-10-30", 70, "lazer"),
];
const budget = {
  cap_cents: 150000,
  control_start: "2026-11-05",
  allocations: [
    { bucket: "lazer" as const, amount_cents: 100000 },
    { bucket: "mercado" as const, amount_cents: 50000 },
  ],
};

describe("detalhe_dia_a_dia bate centavo a centavo com o resumo do mês", () => {
  it("total e total por bucket iguais ao monthStatus", () => {
    const det = dailyDetail({ month: NOV, today: "2026-11-12", budget, transactions, accountName: () => null }, BUCKET_LABEL);
    const st = monthStatus({ today: "2026-11-12", month: NOV, controlStart: budget.control_start, capCents: budget.cap_cents, allocations: budget.allocations, transactions });
    expect(Math.round(det.total * 100)).toBe(st.spent);
    expect(det.bate_com_resumo).toBe(true);
    for (const b of st.buckets) {
      const linha = det.total_por_bucket.find((x) => x.bucket === BUCKET_LABEL[b.bucket]);
      expect(Math.round((linha?.valor ?? 0) * 100)).toBe(b.spent);
    }
    expect(det.itens.map((i) => i.id).sort()).toEqual(["b", "c", "d", "e"]);
  });

  it("sem início do controle conta desde o dia 1; sem orçamento ainda lista os gastos", () => {
    const det = dailyDetail({ month: NOV, today: "2026-11-12", budget: null, transactions, accountName: () => null }, BUCKET_LABEL);
    expect(det.itens.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(det.bate_com_resumo).toBeNull();
  });
});

// ---------- faturas ----------
const cards = [
  { id: "ca", name: "Cartão A", pluggy_account_id: "p-a", closing_day: 7, due_day: 14 },
  { id: "cb", name: "Cartão B", pluggy_account_id: "p-b", closing_day: 7, due_day: 14 },
];
const cardTx = [
  { id: "x1", occurred_on: "2026-11-08", description: "MERCADO", amount_cents: 12000, account_id: "ca", method: "credito" as const, bucket: "lazer" as const, source: "pluggy" },
  { id: "x2", occurred_on: "2026-11-09", description: "LOJA 2/4", amount_cents: 5000, account_id: "ca", method: "credito" as const, bucket: "parcela" as const, source: "pluggy", installment_number: 2, total_installments: 4 },
  { id: "x3", occurred_on: "2026-11-10", description: "STREAMING", amount_cents: 2990, account_id: "cb", method: "credito" as const, bucket: "assinatura" as const, source: "pluggy" },
  { id: "x4", occurred_on: "2026-10-10", description: "STREAMING", amount_cents: 2990, account_id: "cb", method: "credito" as const, bucket: "assinatura" as const, source: "pluggy" },
];
const plan = [{ id: "plan1", name: "Videogame", installment_cents: 13748, installments_count: 4, first_invoice_month: "2026-12-01", status: "ativa" as const, account_id: "cb", purchase_date: null }];
const base = {
  cards,
  fixed: [],
  installments: plan,
  transactions: cardTx,
  budgets: [{ month: NOV, cap_cents: 100000, method: "credito" as const, control_start: null, allocations: [] }],
  today: "2026-11-12",
};

describe("detalhe_fatura: os itens somam exatamente cada linha da composição", () => {
  it("todas as linhas de todos os cartões, em vários meses", () => {
    for (const month of ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]) {
      const inv = invoicesForMonth({ ...base, month });
      for (const c of inv.cards) {
        for (const l of c.lines) {
          const soma = (l.items ?? []).reduce((s, i) => s + i.cents, 0);
          expect(soma, `${c.name} ${month} ${l.label}`).toBe(l.cents);
        }
        const det = invoiceDetail(c, { bills: [], paid: false, paymentIds: [] });
        expect(det.composicao.every((x) => !("aviso" in x))).toBe(true);
        expect(Math.round(det.composicao.reduce((s, x) => s + x.valor * 100, 0))).toBe(c.total);
      }
    }
  });

  it("dezembro do Cartão A: Compras e Parcelas com ids do banco; parcela calculada com n/total", () => {
    const inv = invoicesForMonth({ ...base, month: "2026-12-01" });
    const a = invoiceDetail(inv.cards.find((c) => c.accountId === "ca")!, { bills: [], paid: false, paymentIds: [] });
    const compras = a.composicao.find((l) => l.item === "Compras")!;
    const parcelas = a.composicao.find((l) => l.item === "Parcelas")!;
    expect(compras.ids).toEqual(["x1"]);
    expect(parcelas.itens[0]).toMatchObject({ id: "x2", parcela: "2/4", origem: "banco" });
    const b = invoiceDetail(inv.cards.find((c) => c.accountId === "cb")!, { bills: [], paid: false, paymentIds: [] });
    expect(b.composicao.find((l) => l.item.startsWith("Parcelas do plano"))?.itens[0]).toMatchObject({ parcela: "1/4", origem: "plano" });
  });
});

describe("ligar/desligar um cartão (trocar o id da conta) não muda nenhum total", () => {
  const rename = (id: string) => (id === "ca" ? "ca-novo-id" : id);
  const renamed = {
    ...base,
    cards: base.cards.map((c) => ({ ...c, id: rename(c.id) })),
    transactions: base.transactions.map((t) => ({ ...t, account_id: t.account_id ? rename(t.account_id) : null })),
  };
  it.each(["2026-11-01", "2026-12-01", "2027-01-01", "2027-03-01"])("fatura e contas a pagar em %s", (month) => {
    const a = invoicesForMonth({ ...base, month });
    const b = invoicesForMonth({ ...renamed, month });
    expect(b.total).toBe(a.total);
    expect(b.cards.map((c) => c.total).sort()).toEqual(a.cards.map((c) => c.total).sort());
    const pa = billsForMonth({ ...base, month, payments: [] } as never);
    const pb = billsForMonth({ ...renamed, month, payments: [] } as never);
    expect(pb.total).toBe(pa.total);
    expect(pb.paidTotal).toBe(pa.paidTotal);
  });
});

describe("saude", () => {
  it("aponta fatura paga cujo valor reconstruído não bate (ex.: 700,00 × 1.500,00)", () => {
    const r = healthReport({
      now: new Date("2026-11-12T15:00:00Z"),
      today: "2026-11-12",
      accounts: [
        { id: "fv", name: "Cartão A", kind: "credit_card", pluggy_account_id: "p", pluggy_item_id: "it", synced_at: "2026-11-12T10:00:00Z" },
        { id: "old", name: "Cartão antigo", kind: "credit_card", pluggy_account_id: null, pluggy_item_id: null, synced_at: null },
      ],
      items: [{ item_id: "it", connector_name: "MeuPluggy", status: "UPDATED", last_synced_at: "2026-11-12T10:00:00Z" }],
      transactions: [
        { id: "m1", occurred_on: "2026-11-02", description: "Jantar", amount_cents: 16100, bucket: "mercado", source: "manual", manual_id: null, external_id: null, is_inflow: false, account_id: null },
        // manual já juntado com o banco (ficou com o external_id): NÃO é "sem par"
        { id: "m2", occurred_on: "2026-11-06", description: "Barbeiro", amount_cents: 12000, bucket: "lazer", source: "manual", manual_id: null, external_id: "pluggy-123", is_inflow: false, account_id: "fv" },
        { id: "s1", occurred_on: "2026-11-10", description: "LOJA", amount_cents: 1200, bucket: "sem_categoria", source: "pluggy", manual_id: null, external_id: "pluggy-456", is_inflow: false, account_id: "fv" },
      ],
      installments: [{ id: "g", name: "Videogame", status: "ativa", installment_cents: 13748, installments_count: 4, first_invoice_month: "2026-12-01", account_id: "fv" }],
      coveredInstallmentIds: new Set(),
      paidBills: [{ account_id: "fv", due_date: "2026-11-04", paid_cents: 150000, reconstructed_cents: 70000 }],
    });
    expect(r.faturas_reconstruidas_vs_pagas[0]).toMatchObject({ cartao: "Cartão A", mes: "2026-11", reconstruida: 700, paga: 1500, diferenca: 800 });
    expect(r.alertas.some((a) => a.includes("Cartão A 2026-11: reconstruída 700.00 × paga 1500.00"))).toBe(true);
    expect(r.contas.find((c) => c.conta === "Cartão A")?.status_sync).toBe("ok");
    expect(r.contas.find((c) => c.conta === "Cartão antigo")).toMatchObject({ status_sync: "sem_banco", ligado_ao_cadastro: false });
    expect(r.sem_categoria).toEqual({ quantidade: 1, total: 12 });
    expect(r.manuais_sem_par.map((m) => m.id)).toEqual(["m1"]);
    expect(r.parcelas_do_plano_sem_par.map((p) => p.nome)).toEqual(["Videogame"]);
  });

  it("conta sem sync há mais de 36 h fica 'atrasado'", () => {
    const r = healthReport({
      now: new Date("2026-11-12T15:00:00Z"),
      today: "2026-11-12",
      accounts: [{ id: "a", name: "Cartão B", kind: "credit_card", pluggy_account_id: "p", pluggy_item_id: "it", synced_at: "2026-11-10T10:00:00Z" }],
      items: [{ item_id: "it", connector_name: null, status: "UPDATED", last_synced_at: "2026-11-10T10:00:00Z" }],
      transactions: [],
      installments: [],
      coveredInstallmentIds: new Set(),
      paidBills: [],
    });
    expect(r.contas[0].status_sync).toBe("atrasado");
  });
});

import { billCyclePayments, repairSeries } from "@/lib/cards";
import { runEngine } from "@/lib/engine";

describe("parcela com n/total errado do banco continua a série", () => {
  const row = (id: string, on: string, n: number | null, total: number | null, cents = 5000) => ({
    id,
    account_id: "nu",
    occurred_on: on,
    description: "PET SHOP",
    amount_cents: cents,
    installment_number: n,
    total_installments: total,
    pluggy_bill_id: null,
  });
  it("3/6 e 4/6 seguidos de 5/1 e 6/1 viram 5/6 e 6/6", () => {
    const r = repairSeries([row("a", "2026-09-08", 3, 6), row("b", "2026-10-08", 4, 6), row("c", "2026-11-15", 5, 1), row("d", "2026-12-15", 6, 1)]);
    expect(r.get("c")).toEqual({ installment_number: 5, total_installments: 6 });
    expect(r.get("d")).toEqual({ installment_number: 6, total_installments: 6 });
  });
  it("sem n: usa a última parcela + meses; valor fora de ±1% ou outro cartão não é da série", () => {
    const r = repairSeries([row("a", "2026-09-08", 3, 6), row("b", "2026-11-10", null, null), row("c", "2026-11-11", null, null, 6000), { ...row("d", "2026-11-12", null, null), account_id: "inter" }]);
    expect(r.get("b")).toEqual({ installment_number: 5, total_installments: 6 });
    expect(r.has("c")).toBe(false);
    expect(r.has("d")).toBe(false);
  });
  it("não passa do total: série já terminada não puxa compra nova", () => {
    const r = repairSeries([row("a", "2026-09-08", 6, 6), row("b", "2026-10-08", null, null)]);
    expect(r.has("b")).toBe(false);
  });
  it("o motor marca como Parcela (parcela_da_serie), por cima da categoria do banco, e não mexe no que você travou", () => {
    const base = { is_inflow: false, method: "credito" as const, account_id: "nu", account_kind: "credit_card" as const, pluggy_category: null, source: "pluggy", superseded: false };
    const txs = [
      { ...base, id: "a", occurred_on: "2026-09-08", description: "PET SHOP", amount_cents: 5000, bucket: "parcela" as const, user_locked: false, auto_reason: null, installment_number: 3, total_installments: 6 },
      { ...base, id: "b", occurred_on: "2026-10-08", description: "PET SHOP", amount_cents: 5000, bucket: "parcela" as const, user_locked: false, auto_reason: null, installment_number: 4, total_installments: 6 },
      { ...base, id: "c", occurred_on: "2026-11-15", description: "PET SHOP", amount_cents: 5000, bucket: "lazer" as const, user_locked: false, auto_reason: "categoria_banco", installment_number: 5, total_installments: 1 },
      { ...base, id: "d", occurred_on: "2026-12-15", description: "PET SHOP", amount_cents: 5000, bucket: "lazer" as const, user_locked: true, auto_reason: null, installment_number: 6, total_installments: 1 },
    ];
    const d = runEngine({ txs, rules: [], self: { names: [], taxIds: [] } });
    expect(d.get("c")).toMatchObject({ bucket: "parcela", auto_reason: "parcela_da_serie" });
    expect(d.has("d")).toBe(false);
    // as parcelas antigas fora da janela do motor vêm como histórico, só para reconhecer a série
    const h = runEngine({ txs: txs.slice(2), history: txs.slice(0, 2), rules: [], self: { names: [], taxIds: [] } });
    expect(h.get("c")).toMatchObject({ bucket: "parcela", auto_reason: "parcela_da_serie" });
    expect(h.has("a")).toBe(false);
  });
});

describe("pagamentos da fatura: o ciclo inteiro, não só o último", () => {
  it("fatura de nov (vence 15/11): 2.000,00 em 05/11 + 150,00 em 10/11; o de 10/10 pagou a fatura de outubro", () => {
    const pays = [
      { id: "p0", occurred_on: "2026-10-10", amount_cents: 99999 },
      { id: "p1", occurred_on: "2026-11-05", amount_cents: 200000 },
      { id: "p2", occurred_on: "2026-11-10", amount_cents: 15000 },
      { id: "p3", occurred_on: "2026-11-25", amount_cents: 5000 },
    ];
    const r = billCyclePayments({ due_date: "2026-11-15" }, "2026-10-14", pays);
    expect(r.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.reduce((s, p) => s + p.amount_cents, 0)).toBe(215000);
  });
});
