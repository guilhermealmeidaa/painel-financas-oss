import "server-only";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import { addMonths, monthOf, todayISO } from "@/lib/dates";
import { project } from "@/lib/projection";
import { invoicesForMonth, prepareInvoices } from "@/lib/invoices";
import { inferCardDays } from "@/lib/cards";
import { anchorCurrentMonth } from "@/lib/anchor";
import { billsForMonth } from "@/lib/bills";
import { actualDaily } from "@/lib/projection";
import { monthRange } from "@/lib/dates";
import { DEMO } from "@/lib/demo-flag";
import { demoData } from "@/lib/demo-data";

export type Account = Tables<"accounts">;
export type Transaction = Tables<"transactions">;
export type Installment = Tables<"installment_purchases">;
export type FixedExpense = Tables<"fixed_expenses">;
export type Budget = Tables<"monthly_budgets"> & { allocations: Tables<"budget_allocations">[]; periods: Tables<"budget_periods">[] };

/** Carrega tudo do usuário logado (RLS filtra). O volume é pequeno: um usuário, poucos meses. */
export async function loadAll(): Promise<AllData> {
  // Dados por usuário e "hoje" mudam a cada request: nunca pré-renderizar.
  await connection();
  if (DEMO) return demoData() as unknown as AllData;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) throw new Error("não autenticado");
  return loadAllFor(supabase, userId, (auth?.claims?.email as string | undefined) ?? "");
}

/**
 * Carrega tudo de um usuário com qualquer cliente. Filtra por user_id explicitamente,
 * então também é seguro com a service role (API do Claude/MCP).
 */
export async function loadAllFor(supabase: SupabaseClient<Database>, userId: string, email = "") {
  const [settings, accounts, incomes, fixed, installments, budgets, allocations, transactions, payments, cardBills, periods] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("user_id", userId).order("name"),
    // entradas válidas: planejadas confirmadas + vindas do banco (auto/confirmadas); substituídas e rejeitadas não contam
    supabase.from("incomes").select("*").eq("user_id", userId).in("status", ["confirmada", "auto"]).order("month"),
    supabase.from("fixed_expenses").select("*").eq("user_id", userId).order("month"),
    supabase.from("installment_purchases").select("*").eq("user_id", userId).order("first_invoice_month"),
    supabase.from("monthly_budgets").select("*").eq("user_id", userId).order("month"),
    supabase.from("budget_allocations").select("*").eq("user_id", userId),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      // manuais substituídos por transações do banco não contam em nada
      .eq("superseded", false)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    // marcações de pago; as que você desfez (dismissed) vêm separadas e não contam
    supabase.from("bill_payments").select("month, key, transaction_id, dismissed").eq("user_id", userId),
    supabase.from("card_bills").select("account_id, due_date, total_cents, pluggy_bill_id, closing_date, status, paid_cents, payment_tx_id").eq("user_id", userId),
    supabase.from("budget_periods").select("*").eq("user_id", userId).order("start_date"),
  ]);
  for (const r of [settings, accounts, incomes, fixed, installments, budgets, allocations, transactions, payments, cardBills, periods]) {
    if (r.error) throw new Error(`Falha ao carregar dados: ${r.error.message}`);
  }
  const budgetsWithAlloc: Budget[] = (budgets.data ?? []).map((b) => ({
    ...b,
    allocations: (allocations.data ?? []).filter((a) => a.budget_id === b.id),
    periods: (periods.data ?? []).filter((p) => p.month === b.month),
  }));
  return {
    settings: settings.data,
    accounts: accounts.data ?? [],
    incomes: incomes.data ?? [],
    fixed: fixed.data ?? [],
    installments: installments.data ?? [],
    budgets: budgetsWithAlloc,
    transactions: transactions.data ?? [],
    payments: (payments.data ?? []).filter((p) => !p.dismissed),
    /** marcações de pago que você desfez: ganham até da fatura paga no banco */
    dismissedPayments: (payments.data ?? []).filter((p) => p.dismissed),
    cardBills: cardBills.data ?? [],
    email,
  };
}

export type AllData = Awaited<ReturnType<typeof loadAllFor>>;

/** Do início configurado até o último mês com fixos ou orçamento cadastrados. */
export function projectionRange(d: AllData) {
  const start = d.settings?.projection_start ?? monthOf(todayISO());
  const months = [...d.fixed.map((f) => f.month), ...d.budgets.map((b) => b.month), ...d.incomes.map((i) => i.month)];
  const end = months.reduce((max, m) => (m > max ? m : max), addMonths(start, 0));
  return { start, end };
}

/**
 * Entradas comuns para faturas/contas a pagar/projeção.
 * Cartão sem dia de fechamento/vencimento cadastrado usa o que as faturas do banco indicam.
 */
export function invoiceInputs(d: AllData, includePlanned = false) {
  const cards = d.accounts
    .filter((a) => a.kind === "credit_card")
    .map((a) => {
      if (a.closing_day && a.due_day) return a;
      const inf = inferCardDays(d.cardBills.filter((b) => b.account_id === a.id));
      return { ...a, closing_day: a.closing_day ?? inf.closing_day, due_day: a.due_day ?? inf.due_day };
    });
  return {
    cards,
    fixed: d.fixed,
    installments: d.installments,
    transactions: d.transactions,
    budgets: d.budgets,
    realBills: d.cardBills,
    dismissed: d.dismissedPayments,
    today: todayISO(),
    includePlanned,
  };
}

/**
 * Saídas fora do cartão com dado real:
 * - fixo cadastrado cujo pagamento foi achado no banco: vale o valor pago (substitui o planejado);
 * - saída na conta (débito/Pix) classificada como fixo ou assinatura SEM fixo cadastrado: "fixo avulso" no mês;
 * - assinatura na conta: projetada nos meses seguintes pela média dos 2 últimos débitos.
 * (Fixo/assinatura no cartão já estão dentro da fatura real.)
 */
export function realOutflows(d: AllData, start: string, end: string) {
  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const paidTx = new Map<string, string>(); // fixed id -> transaction id
  for (const p of d.payments) if (p.key.startsWith("fixed:") && p.transaction_id) paidTx.set(p.key.slice(6), p.transaction_id);
  const matchedTx = new Set(paidTx.values());
  const fixed = d.fixed
    .filter((f) => f.category !== "cartao")
    .map((f) => {
      const t = paidTx.has(f.id) ? txById.get(paidTx.get(f.id)!) : undefined;
      return t ? { ...f, amount_cents: t.amount_cents } : f;
    });
  const today = todayISO();
  const extras: { month: string; amount_cents: number }[] = [];
  const subs = new Map<string, { cents: number; on: string }[]>();
  for (const t of d.transactions) {
    if (t.is_inflow || t.method === "credito" || matchedTx.has(t.id) || t.occurred_on > today) continue;
    if (t.bucket !== "fixo" && t.bucket !== "assinatura") continue;
    const m = monthOf(t.occurred_on);
    if (m < start || m > end) continue;
    extras.push({ month: m, amount_cents: t.amount_cents });
    if (t.bucket === "assinatura") {
      const k = t.description.toLowerCase().split("|").slice(-1)[0].trim();
      subs.set(k, [...(subs.get(k) ?? []), { cents: t.amount_cents, on: t.occurred_on }]);
    }
  }
  for (const list of subs.values()) {
    const sorted = [...list].sort((a, b) => b.on.localeCompare(a.on));
    const avg = Math.round(sorted.slice(0, 2).reduce((s, x) => s + x.cents, 0) / Math.min(2, sorted.length));
    for (let m = addMonths(monthOf(sorted[0].on), 1); m <= end; m = addMonths(m, 1)) extras.push({ month: m, amount_cents: avg });
  }
  return { fixed, extras };
}

/** Contas correntes do banco com saldo informado no último sync. */
export function bankBalance(d: AllData): { cents: number; accounts: number; syncedAt: string | null } | null {
  const accs = d.accounts.filter((a) => a.kind === "checking" && a.pluggy_item_id && a.balance_cents != null);
  if (!accs.length) return null;
  const syncedAt = accs.reduce<string | null>((m, a) => (a.synced_at && (!m || a.synced_at < m) ? a.synced_at : m), null);
  return { cents: accs.reduce((s, a) => s + (a.balance_cents ?? 0), 0), accounts: accs.length, syncedAt };
}

/** Âncora do mês atual no saldo real . Null sem conta conectada ou fora do período. */
export function currentAnchor(d: AllData, start: string, end: string, inputs: ReturnType<typeof invoiceInputs>) {
  const today = todayISO();
  const month = monthOf(today);
  const bal = bankBalance(d);
  if (!bal || month < start || month > end) return null;
  const budget = d.budgets.find((b) => b.month === month) ?? null;
  const spent = actualDaily(d.transactions, month, { controlStart: budget?.control_start ?? null, today });
  const { bills } = billsForMonth({ ...inputs, month, payments: d.payments });
  const a = anchorCurrentMonth({
    balanceCents: bal.cents,
    plannedIncomes: d.incomes.filter((i) => i.month === month && i.source === "manual"),
    bankIncomes: d.incomes.filter((i) => i.month === month && i.source === "banco"),
    unpaidBills: bills.filter((b) => !b.paid),
    budget,
    dailySpentCents: spent.credit + spent.debit,
  });
  return { month, ...a };
}

/**
 * Projeção "real primeiro": o que sai para os cartões em cada mês é o total das faturas
 * (dado do banco para cartões ligados; estimativa só para os não ligados), e os fixos de cartão
 * do plano não são somados à parte. No 1º mês do plano as faturas já estavam pagas antes dele.
 */
export function runProjection(d: AllData, includePlanned = false) {
  const { start, end } = projectionRange(d);
  const inputs = invoiceInputs(d, includePlanned);
  const prep = prepareInvoices(inputs);
  const cardTotals = new Map(
    monthRange(start, end).map((m) => [m, m === start ? 0 : invoicesForMonth({ ...inputs, month: m }, prep).total]),
  );
  const { fixed, extras } = realOutflows(d, start, end);
  const anchor = currentAnchor(d, start, end, inputs);
  return project({
    start,
    end,
    openingBalanceCents: d.settings?.opening_balance_cents ?? 0,
    incomes: d.incomes,
    fixedExpenses: fixed,
    extraOutflows: extras,
    installments: d.installments,
    budgets: d.budgets,
    transactions: d.transactions,
    includePlanned,
    cardTotals,
    today: todayISO(),
    anchor: anchor ?? undefined,
  });
}
