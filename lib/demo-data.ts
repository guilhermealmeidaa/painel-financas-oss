import "server-only";
import { addDays, addMonths, monthOf, todayISO } from "@/lib/dates";

/**
 * Dados 100% inventados para o modo demonstração (prints). Tudo é relativo a hoje,
 * então o mês atual sempre tem gastos até hoje, faturas e parcelas em andamento.
 */
export function demoData() {
  const today = todayISO();
  const M = monthOf(today);
  const day = (month: string, d: number) => `${month.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const now = new Date().toISOString();
  const uid = "demo-user";
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const cards = [
    { id: "card-nu", name: "Nubank", closing_day: 7, due_day: 14 },
    { id: "card-inter", name: "Inter", closing_day: 1, due_day: 10 },
    { id: "card-mp", name: "Mercado Pago", closing_day: 8, due_day: 13 },
  ];
  const accounts = [
    ...cards.map((c) => ({
      id: c.id,
      user_id: uid,
      name: c.name,
      kind: "credit_card",
      closing_day: c.closing_day,
      due_day: c.due_day,
      days_source: "banco",
      pluggy_account_id: `pluggy-${c.id}`,
      pluggy_item_id: "demo-item",
      balance_cents: null,
      credit_limit_cents: c.id === "card-nu" ? 900000 : c.id === "card-inter" ? 600000 : 450000,
      available_limit_cents: c.id === "card-nu" ? 612040 : c.id === "card-inter" ? 401230 : 318870,
      bill_close_date: null,
      bill_due_date: null,
      synced_at: now,
      created_at: now,
    })),
    {
      id: "conta-corrente",
      user_id: uid,
      name: "Conta corrente",
      kind: "checking",
      closing_day: null,
      due_day: null,
      days_source: null,
      pluggy_account_id: "pluggy-conta",
      pluggy_item_id: "demo-item",
      balance_cents: 218050,
      credit_limit_cents: null,
      available_limit_cents: null,
      bill_close_date: null,
      bill_due_date: null,
      synced_at: now,
      created_at: now,
    },
  ];

  type Tx = {
    id: string;
    occurred_on: string;
    description: string;
    amount_cents: number;
    account_id: string | null;
    method: "credito" | "debito" | "pix";
    bucket: "lazer" | "mercado" | "fixo" | "assinatura" | "parcela" | "ignorar" | "sem_categoria";
    installment_number?: number | null;
    total_installments?: number | null;
  };
  const txs: Tx[] = [];
  const add = (t: Omit<Tx, "id">) => {
    if (t.occurred_on <= today) txs.push({ ...t, id: id("tx") });
  };

  // dia a dia (lazer e mercado) neste mês e no anterior, no crédito
  const daily: [number, string, number, "lazer" | "mercado", string][] = [
    [1, "Padaria Pão Quente", 2850, "mercado", "card-nu"],
    [2, "Supermercado Bom Preço", 21740, "mercado", "card-inter"],
    [3, "Cinema Shopping", 6400, "lazer", "card-nu"],
    [4, "Uber", 2390, "lazer", "card-mp"],
    [5, "Restaurante Sabor da Casa", 11280, "lazer", "card-nu"],
    [6, "Hortifruti Verde", 4615, "mercado", "card-inter"],
    [8, "Livraria Cultura", 7990, "lazer", "card-mp"],
    [9, "Farmácia Saúde", 3870, "mercado", "card-nu"],
    [10, "Bar do Centro", 9450, "lazer", "card-nu"],
    [11, "Supermercado Bom Preço", 18325, "mercado", "card-inter"],
    [12, "iFood", 5690, "lazer", "card-mp"],
    [14, "Feira orgânica", 6120, "mercado", "card-nu"],
    [16, "Show no parque", 12000, "lazer", "card-nu"],
    [18, "Supermercado Bom Preço", 24310, "mercado", "card-inter"],
    [20, "Café Grão Dourado", 1980, "lazer", "card-mp"],
    [22, "Padaria Pão Quente", 3240, "mercado", "card-nu"],
    [24, "Boliche", 8800, "lazer", "card-mp"],
    [26, "Açougue Central", 9870, "mercado", "card-inter"],
  ];
  for (const m of [addMonths(M, -1), M]) {
    for (const [d, desc, cents, bucket, acc] of daily) {
      add({ occurred_on: day(m, d), description: desc, amount_cents: cents, account_id: acc, method: "credito", bucket });
    }
  }

  // assinaturas no cartão
  for (const m of [addMonths(M, -2), addMonths(M, -1), M]) {
    add({ occurred_on: day(m, 3), description: "Spotify", amount_cents: 2190, account_id: "card-nu", method: "credito", bucket: "assinatura" });
    add({ occurred_on: day(m, 9), description: "Netflix", amount_cents: 4490, account_id: "card-inter", method: "credito", bucket: "assinatura" });
    add({ occurred_on: day(m, 11), description: "Academia Movimento", amount_cents: 11990, account_id: "card-mp", method: "credito", bucket: "assinatura" });
  }

  // compras parceladas que o banco já mandou (o painel calcula as próximas)
  const parcels: [string, string, number, number, number, number][] = [
    // descrição, cartão, valor, total, nº da parcela deste mês, dia
    ["Notebook Ultra 14", "card-inter", 38990, 10, 4, 15],
    ["Smartphone Galaxy", "card-nu", 21500, 12, 7, 6],
    ["Tênis de corrida", "card-mp", 8990, 4, 2, 5],
    ["Cadeira de escritório", "card-nu", 13250, 6, 3, 2],
  ];
  for (const [desc, acc, cents, total, nNow, d] of parcels) {
    for (let k = 0; k < 3; k++) {
      const n = nNow - k;
      if (n < 1) continue;
      add({
        occurred_on: day(addMonths(M, -k), d),
        description: `${desc} ${n}/${total}`,
        amount_cents: cents,
        account_id: acc,
        method: "credito",
        bucket: "parcela",
        installment_number: n,
        total_installments: total,
      });
    }
  }

  const transactions = txs
    .map((t) => ({
      user_id: uid,
      source: "banco",
      external_id: t.id,
      created_at: now,
      is_inflow: false,
      pluggy_status: "POSTED",
      installment_number: null,
      total_installments: null,
      pluggy_bill_id: null,
      pluggy_category: null,
      synced_at: now,
      auto_reason: null,
      prev_bucket: null,
      user_locked: false,
      linked_tx_id: null,
      fee_cents: null,
      invoice_month: null,
      manual_id: null,
      superseded: false,
      subtype: null,
      ...t,
    }))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

  // plano: 14 meses a partir de hoje
  const months = Array.from({ length: 14 }, (_, i) => addMonths(M, i));
  const incomes = months.map((m) => ({
    id: id("inc"),
    user_id: uid,
    month: m,
    kind: "salario",
    description: "Salário",
    amount_cents: 750000,
    source: "manual",
    status: "confirmada",
    transaction_id: null,
    created_at: now,
  }));

  const fixedDefs: [string, string, number, number][] = [
    // nome, categoria, valor, meses
    ["Aluguel", "conta", 185000, 14],
    ["Condomínio", "conta", 42000, 14],
    ["Plano de saúde", "conta", 38000, 14],
    ["Luz", "conta", 18000, 14],
    ["Internet", "conta", 11000, 14],
    ["Financiamento do carro", "emprestimo", 109000, 9],
  ];
  const fixed = fixedDefs.flatMap(([name, category, cents, n]) =>
    months.slice(0, n).map((m) => ({
      id: id("fix"),
      user_id: uid,
      month: m,
      name,
      category,
      amount_cents: cents,
      account_id: null,
      source: "manual",
      match_pattern: null,
      created_at: now,
    })),
  );

  const budgets = months.map((m) => {
    const bid = id("bud");
    return {
      id: bid,
      user_id: uid,
      month: m,
      method: "credito",
      cap_cents: 180000,
      control_start: null,
      skipped_weekends: [] as string[],
      created_at: now,
      allocations: [
        { id: id("al"), user_id: uid, budget_id: bid, bucket: "lazer", amount_cents: 110000 },
        { id: id("al"), user_id: uid, budget_id: bid, bucket: "mercado", amount_cents: 70000 },
      ],
    };
  });

  const plan = (name: string, acc: string, cents: number, n: number, first: string, status = "ativa", notes: string | null = null) => ({
    id: id("ip"), user_id: uid, name, total_cents: cents * n, installments_count: n, installment_cents: cents,
    first_invoice_month: first, account_id: acc, status, notes, created_at: now, covered_by_bank: false, matched_tx_id: null, purchase_date: null,
  });
  const installments = [
    plan("Geladeira frost free", "card-nu", 28990, 10, addMonths(M, -2)),
    plan("Curso de inglês", "card-mp", 19900, 6, addMonths(M, -1)),
    plan("Bicicleta", "card-inter", 15490, 8, M),
    {
      id: id("ip"),
      user_id: uid,
      name: "Viagem de férias",
      total_cents: 252000,
      installments_count: 6,
      installment_cents: 42000,
      first_invoice_month: addMonths(M, 2),
      account_id: "card-inter",
      status: "planejada",
      notes: "Ainda não comprado",
      created_at: now,
      covered_by_bank: false,
      matched_tx_id: null,
      purchase_date: null,
    },
  ];

  // já pagos este mês: aluguel, condomínio, internet e a fatura do Nubank
  const paidFixed = fixed.filter((f) => f.month === M && ["Aluguel", "Condomínio", "Internet"].includes(f.name));
  const payments = [
    ...paidFixed.map((f) => ({ month: M, key: `fixed:${f.id}`, transaction_id: null, dismissed: false })),
    { month: M, key: "card:card-nu", transaction_id: null, dismissed: false },
  ];

  return {
    settings: {
      user_id: uid,
      projection_start: M,
      opening_balance_cents: 0,
      self_names: [],
      self_tax_ids: [],
      updated_at: now,
    },
    accounts,
    incomes,
    fixed,
    installments,
    budgets,
    transactions,
    payments,
    dismissedPayments: [] as typeof payments,
    cardBills: [] as { account_id: string; due_date: string; total_cents: number; pluggy_bill_id: string | null; closing_date: string | null; status: string | null }[],
    email: "voce@exemplo.com",
    _today: addDays(today, 0),
  };
}
