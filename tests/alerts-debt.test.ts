import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const M = (m: string) => `${m}-01`;
const conta = { id: "cc", user_id: "u", name: "Conta", kind: "checking", closing_day: null, due_day: null, pluggy_account_id: "p", pluggy_item_id: "it", balance_cents: 2000, synced_at: "2026-11-13T10:00:00Z" };
const cartao = { id: "cb", user_id: "u", name: "Cartão B", kind: "credit_card", closing_day: 7, due_day: 14, pluggy_account_id: "p2", pluggy_item_id: "it", balance_cents: null, synced_at: null };
const base = () => ({
  settings: { projection_start: M("2026-11"), opening_balance_cents: 0, self_names: [], self_tax_ids: [] },
  accounts: [conta, cartao],
  incomes: [],
  fixed: [
    // empréstimo de 3 meses (nov pago, dez e jan faltam) e veículo até fev
    ...["2026-10", "2026-11", "2026-12", "2027-01"].map((m, i) => ({ id: `e${i}`, month: M(m), name: "Empréstimo", category: "emprestimo", account_id: null, amount_cents: 40000, match_pattern: null })),
    ...["2026-11", "2026-12", "2027-01", "2027-02"].map((m, i) => ({ id: `m${i}`, month: M(m), name: "Carro", category: "veiculo", account_id: null, amount_cents: 60000, match_pattern: null })),
    { id: "luz", month: M("2026-11"), name: "Luz", category: "conta", account_id: null, amount_cents: 30000, match_pattern: null },
  ],
  installments: [
    { id: "vg", name: "Videogame", total_cents: 60000, installments_count: 4, installment_cents: 15000, first_invoice_month: M("2026-12"), account_id: "cb", status: "ativa", purchase_date: "2026-11-10", covered_by_bank: false, matched_tx_id: null },
  ],
  budgets: [{ id: "b", month: M("2026-11"), method: "credito", cap_cents: 100000, control_start: null, skipped_weekends: [], allocations: [], periods: [] }],
  transactions: [] as Record<string, unknown>[],
  payments: [{ month: M("2026-11"), key: "fixed:e1", transaction_id: null, dismissed: false }],
  dismissedPayments: [],
  cardBills: [{ account_id: "cb", due_date: "2026-11-14", total_cents: 5000, pluggy_bill_id: "b1", closing_date: "2026-11-07", status: "aberta", paid_cents: 0, payment_tx_id: null }],
  email: "",
});

describe("dívidas do plano", () => {
  it("total, quitado, falta e mês em que fica livre", async () => {
    const { debtSummary } = await import("@/lib/debt");
    const s = debtSummary(base() as never, "2026-11-13");
    const emp = s.debts.find((x) => x.name === "Empréstimo")!;
    // out e nov (marcado como pago) já foram; dez e jan faltam
    expect(emp).toMatchObject({ paid: 80000, remaining: 80000, monthsLeft: 2, endMonth: M("2027-01") });
    expect(s.debts.find((x) => x.name === "Videogame")).toMatchObject({ remaining: 60000, monthsLeft: 4, endMonth: M("2027-03") });
    expect(s.debts.some((x) => x.name === "Luz")).toBe(false);
    expect(s.freeMonth).toBe(M("2027-03"));
    expect(s.perMonth.find((p) => p.month === M("2026-12"))?.cents).toBe(40000 + 60000 + 15000);
  });
});

describe("alertas", () => {
  it("fatura de débito automático que o saldo não cobre, uma chave por vencimento", async () => {
    const { computeAlerts } = await import("@/lib/alerts");
    const r = computeAlerts(base() as never, [], "2026-11-13", "2026-11-13T12:00:00Z", { ritmo: false, sync: false, assinaturas: false, fora_do_padrao: false });
    const c = r.filter((a) => a.kind === "contas");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].key).toMatch(/^conta:2026-11-14:card:cb$/);
    expect(c[0].body).toContain("faltam");
  });

  it("banco sem sync há mais de 30 h e status com erro", async () => {
    const { computeAlerts } = await import("@/lib/alerts");
    const r = computeAlerts(
      base() as never,
      [
        { id: "a", connector_name: "Banco A", status: "UPDATED", last_synced_at: "2026-11-11T08:00:00Z" },
        { id: "b", connector_name: "Banco B", status: "LOGIN_ERROR", last_synced_at: "2026-11-13T11:00:00Z" },
        { id: "c", connector_name: "Banco C", status: "UPDATED", last_synced_at: "2026-11-13T11:00:00Z" },
      ],
      "2026-11-13",
      "2026-11-13T12:00:00Z",
      { contas: false, ritmo: false, assinaturas: false, fora_do_padrao: false },
    );
    expect(r.map((a) => a.title)).toEqual(["Banco A sem atualizar", "Banco B sem atualizar"]);
  });

  it("ritmo: avisa ao passar de 80% e ao estourar o teto; desligado não avisa", async () => {
    const { computeAlerts } = await import("@/lib/alerts");
    const d = base();
    d.transactions = [{ id: "g", occurred_on: "2026-11-10", description: "X", amount_cents: 85000, account_id: "cb", method: "credito", bucket: "lazer", source: "pluggy", is_inflow: false, external_id: "x", superseded: false, pluggy_status: "POSTED", total_installments: null, auto_reason: null }];
    const only = { contas: false, sync: false, assinaturas: false, fora_do_padrao: false };
    expect(computeAlerts(d as never, [], "2026-11-13", "2026-11-13T12:00:00Z", only).map((a) => a.key)).toEqual(["ritmo:2026-11-01:20"]);
    (d.transactions[0] as { amount_cents: number }).amount_cents = 120000;
    expect(computeAlerts(d as never, [], "2026-11-13", "2026-11-13T12:00:00Z", only).map((a) => a.key)).toEqual(["ritmo:2026-11-01:passou"]);
    expect(computeAlerts(d as never, [], "2026-11-13", "2026-11-13T12:00:00Z", { ...only, ritmo: false })).toEqual([]);
  });

  it("resumo do dia", async () => {
    const { dailySummary } = await import("@/lib/alerts");
    const d = base();
    d.transactions = [{ id: "g", occurred_on: "2026-11-13", description: "Almoço", amount_cents: 4500, account_id: "cb", method: "credito", bucket: "lazer", source: "manual", is_inflow: false, external_id: null, superseded: false, pluggy_status: null, total_installments: null, auto_reason: null }];
    const s = dailySummary(d as never, "2026-11-13")!;
    s.body = s.body.replace(/\s/g, " ");
    expect(s.body).toContain("Hoje: R$ 45,00 em 1 gasto.");
    expect(s.body).toContain("Ainda dá para gastar R$ 955,00");
  });
});
