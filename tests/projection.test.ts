import { describe, expect, it } from "vitest";
import { countsInDaily, project, installmentEndMonth } from "@/lib/projection";
import { monthStatus, remainingWeekends } from "@/lib/budget";
import { parseBRLToCents } from "@/lib/money";
import { budgets, fixedExpenses, incomes, installments, novTransactions, range } from "./fixtures";

const base = {
  ...range,
  openingBalanceCents: 0,
  incomes,
  fixedExpenses,
  installments,
  budgets,
};

describe("projeção com os dados do seed", () => {
  // Os R$ 1.500 de nov entram inteiros (teto), sem a compra planejada.
  const rows = project({ ...base, transactions: novTransactions });
  const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));

  it("bate os saldos esperados: nov ~2.287, dez ~1.460, jan ~1.050, fev ~1.465", () => {
    expect(byMonth["2026-11-01"].balance).toBe(228_700);
    expect(byMonth["2026-12-01"].balance).toBe(146_182);
    expect(byMonth["2027-01-01"].balance).toBe(104_931);
    expect(byMonth["2027-02-01"].balance).toBe(146_280);
    // tolerância de R$ 15 em relação aos números aproximados do plano
    const approx = { "2026-11-01": 2287, "2026-12-01": 1460, "2027-01-01": 1050, "2027-02-01": 1465 };
    for (const [m, reais] of Object.entries(approx)) {
      expect(Math.abs(byMonth[m].balance - reais * 100)).toBeLessThanOrEqual(1500);
    }
  });

  it("joga o crédito de nov na fatura de dez", () => {
    expect(byMonth["2026-11-01"].dailyOnCredit).toBe(150_000);
    expect(byMonth["2026-11-01"].daily).toBe(0);
    expect(byMonth["2026-12-01"].creditInvoice).toBe(150_000);
    expect(byMonth["2026-12-01"].daily).toBe(200_000);
    expect(byMonth["2027-01-01"].creditInvoice).toBe(0);
  });

  it("soma parcelas novas por mês", () => {
    expect(byMonth["2026-11-01"].installments).toBe(0);
    expect(byMonth["2026-12-01"].installments).toBe(4900 + 1870 + 13748);
    expect(byMonth["2027-01-01"].installments).toBe(4900 + 1870 + 13748 + 23333);
  });

  it("alerta janeiro: fecha negativo sozinho", () => {
    expect(byMonth["2027-01-01"].alerts.negativeMonth).toBe(true);
    expect(byMonth["2027-02-01"].alerts.negativeMonth).toBe(false);
    expect(rows.some((r) => r.alerts.lowBalance)).toBe(false);
  });

  it("estourar o teto de nov piora a fatura de dez", () => {
    const extra = { occurred_on: "2026-11-28", amount_cents: 100_000, method: "credito" as const, bucket: "lazer" as const };
    const r = project({ ...base, transactions: [...novTransactions, extra] });
    expect(r[1].creditInvoice).toBe(83_300 + 100_000);
    expect(r[1].balance).toBe(146_182 - 33_300);
  });

  it("presente planejado só entra se pedir", () => {
    const r = project({ ...base, transactions: novTransactions, includePlanned: true });
    expect(r[2].balance).toBe(104_931 - 4167);
  });
});

describe("mês atual", () => {
  it("lazer e mercado em 11/11, pulando o fim de semana de folga", () => {
    const s = monthStatus({
      today: "2026-11-11",
      capCents: 150_000,
      allocations: [
        { bucket: "lazer", amount_cents: 100_000 },
        { bucket: "mercado", amount_cents: 50_000 },
      ],
      transactions: novTransactions,
      skippedWeekends: ["2026-11-21"],
    });
    expect(s.spent).toBe(83_300);
    expect(s.remaining).toBe(66_700);
    expect(s.buckets.find((b) => b.bucket === "lazer")?.remaining).toBe(32_800);
    expect(s.buckets.find((b) => b.bucket === "mercado")?.remaining).toBe(33_900);
    expect(s.weekends).toEqual(["2026-11-14", "2026-11-28"]);
    expect(s.perWeekend?.byBucket.lazer).toBe(16_400);
  });

  it("domingo ainda conta o fim de semana em andamento", () => {
    expect(remainingWeekends("2026-11-15")).toEqual(["2026-11-14", "2026-11-21", "2026-11-28"]);
    expect(remainingWeekends("2026-11-30")).toEqual([]);
  });
});

describe("utilitários", () => {
  it("lê valores digitados em pt-BR", () => {
    expect(parseBRLToCents("18,70")).toBe(1870);
    expect(parseBRLToCents("1.500")).toBe(150_000);
    expect(parseBRLToCents("1.500,50")).toBe(150_050);
    expect(parseBRLToCents("137.48")).toBe(13_748);
    expect(parseBRLToCents("R$ 49")).toBe(4900);
    expect(parseBRLToCents("abc")).toBeNull();
  });

  it("calcula o mês em que a parcela termina", () => {
    expect(installmentEndMonth(installments[1])).toBe("2027-11-01");
    expect(installmentEndMonth(installments[0])).toBe("2027-03-01");
  });
});

describe("itens 6 e 7: uma regra só para o dia a dia", () => {
  const txs = [
    { occurred_on: "2026-11-02", amount_cents: 5000, method: "credito" as const, bucket: "lazer" as const }, // antes do controle
    { occurred_on: "2026-11-06", amount_cents: 12000, method: "credito" as const, bucket: "lazer" as const },
    { occurred_on: "2026-11-07", amount_cents: 16100, method: "credito" as const, bucket: "mercado" as const },
    { occurred_on: "2026-11-15", amount_cents: 4509, method: "credito" as const, bucket: "lazer" as const }, // data futura (PET SHOP)
    { occurred_on: "2026-11-08", amount_cents: 5100, method: "credito" as const, bucket: "assinatura" as const }, // não é dia a dia
  ];
  const ctx = { month: "2026-11-01", controlStart: "2026-11-05", today: "2026-11-12" };

  it("conta lazer/mercado do início do controle até hoje", () => {
    expect(txs.filter((t) => countsInDaily(t, ctx)).map((t) => t.amount_cents)).toEqual([12000, 16100]);
    // sem início do controle: desde o dia 1
    expect(txs.filter((t) => countsInDaily(t, { ...ctx, controlStart: null })).length).toBe(3);
  });

  it("resumo do mês e lista de transações dão o mesmo total (mesma fonte)", () => {
    const status = monthStatus({
      today: "2026-11-12",
      controlStart: "2026-11-05",
      capCents: 150000,
      allocations: [
        { bucket: "lazer", amount_cents: 100000 },
        { bucket: "mercado", amount_cents: 50000 },
      ],
      transactions: txs,
    });
    const listSum = txs.filter((t) => t.bucket === "lazer" && countsInDaily(t, ctx)).reduce((s, t) => s + t.amount_cents, 0);
    expect(status.buckets.find((b) => b.bucket === "lazer")?.spent).toBe(listSum);
    expect(status.spent).toBe(12000 + 16100);
  });

  it("mês que já passou: conta o mês inteiro (hoje > fim do mês)", () => {
    const status = monthStatus({ today: "2026-12-10", month: "2026-11-01", controlStart: "2026-11-05", capCents: 150000, allocations: [], transactions: txs });
    expect(status.spent).toBe(12000 + 16100 + 4509);
    expect(status.weekends).toEqual([]);
  });
});

describe("ritmo por fim de semana", () => {
  it("mês futuro: todos os sábados do mês; ritmo = teto ÷ quantidade, por bucket = orçado ÷ quantidade", async () => {
    const { monthWeekends, budgetStatus } = await import("@/lib/budget");
    expect(monthWeekends("2026-12-01")).toEqual(["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"]);
    const st = budgetStatus(
      { month: "2026-12-01", cap_cents: 200000, control_start: null, skipped_weekends: [], allocations: [{ bucket: "lazer", amount_cents: 120000 }, { bucket: "mercado", amount_cents: 80000 }] },
      [],
      "2026-11-13",
    );
    expect(st.weekends).toEqual(["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"]);
    expect(st.perWeekend).toEqual({ total: 50000, byBucket: { lazer: 30000, mercado: 20000 } });
    expect(st.buckets.map((b) => b.spent)).toEqual([0, 0]);
  });

  it("mês atual: sábados que faltam menos os 'sem gasto' (nov/26 com 21/11 sem gasto = 14 e 28)", async () => {
    const { countingWeekends, budgetStatus } = await import("@/lib/budget");
    expect(countingWeekends("2026-11-01", "2026-11-13", ["2026-11-21"])).toEqual(["2026-11-14", "2026-11-28"]);
    // domingo ainda conta o sábado de ontem
    expect(countingWeekends("2026-11-01", "2026-11-29", [])).toEqual(["2026-11-28"]);
    const st = budgetStatus({ month: "2026-11-01", cap_cents: 150000, control_start: "2026-11-05", skipped_weekends: ["2026-11-21"], allocations: [] }, [], "2026-11-13");
    expect(st.perWeekend?.total).toBe(75000);
  });

  it("mês passado: sem ritmo", async () => {
    const { budgetStatus } = await import("@/lib/budget");
    expect(budgetStatus({ month: "2026-10-01", cap_cents: 150000, control_start: null, skipped_weekends: [], allocations: [] }, [], "2026-11-13").perWeekend).toBeNull();
  });
});

describe("períodos especiais (viagem com teto próprio)", () => {
  const tx = (on: string, reais: number, bucket = "lazer") => ({ occurred_on: on, amount_cents: reais * 100, bucket, method: "pix", account_id: null, superseded: false, is_inflow: false, source: "manual" }) as never;
  const dez = (txs: never[], today = "2026-11-13") =>
    import("@/lib/budget").then(({ budgetStatus }) =>
      budgetStatus(
        {
          month: "2026-12-01",
          cap_cents: 200000,
          control_start: null,
          skipped_weekends: [],
          allocations: [{ bucket: "lazer", amount_cents: 120000 }, { bucket: "mercado", amount_cents: 80000 }],
          periods: [{ name: "Viagem", start_date: "2026-12-18", end_date: "2026-12-23", cap_cents: 80000 }],
        },
        txs,
        today,
      ),
    );

  it("teto da viagem sai do teto do mês; fins de semana da viagem saem do ritmo", async () => {
    const st = await dez([]);
    expect(st.weekends).toEqual(["2026-12-05", "2026-12-12", "2026-12-26"]);
    expect(st.normalRemaining).toBe(120000);
    expect(st.perWeekend?.total).toBe(40000);
    // lazer 1.200 − 60% de 800 = 720 ÷ 3; mercado 800 − 40% de 800 = 480 ÷ 3
    expect(st.perWeekend?.byBucket).toEqual({ lazer: 24000, mercado: 16000 });
    expect(st.remaining).toBe(200000);
  });

  it("gasto na viagem conta nela; o que passa do teto dela sai do normal", async () => {
    const st = await dez([tx("2026-12-05", 100), tx("2026-12-19", 900)], "2026-12-20");
    expect(st.periods[0]).toMatchObject({ spent: 90000, remaining: -10000 });
    // 2.000 − 800 (viagem) − 100 (fora) − 100 (estouro) = 1.000
    expect(st.normalRemaining).toBe(100000);
    expect(st.remaining).toBe(100000);
  });
});
