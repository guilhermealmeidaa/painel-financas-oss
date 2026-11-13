import { addDays, lastDayOfMonth, monthOf, weekday } from "./dates";
import { countsInDaily, type Bucket, type TransactionLike } from "./projection";

export interface BucketStatus {
  bucket: Bucket;
  budgeted: number;
  spent: number;
  remaining: number;
}

/** Período especial do mês (ex.: viagem) com teto próprio, reservado de dentro do teto do mês. */
export interface PeriodLike {
  name: string;
  start_date: string;
  end_date: string;
  cap_cents: number;
}

export interface PeriodStatus {
  name: string;
  start: string;
  end: string;
  cap: number;
  spent: number;
  remaining: number;
}

/** O fim de semana (sábado) encosta em algum período? (sábado ou domingo dentro dele) */
export function weekendInPeriods(saturday: string, periods: PeriodLike[] = []): boolean {
  const sunday = addDays(saturday, 1);
  return periods.some((p) => (saturday >= p.start_date && saturday <= p.end_date) || (sunday >= p.start_date && sunday <= p.end_date));
}

export interface MonthStatus {
  cap: number;
  spent: number;
  /** teto − tudo que foi gasto (inclui os períodos) */
  remaining: number;
  /** o que sobra para os fins de semana normais: teto − tetos dos períodos − gasto fora deles − estouro dos períodos */
  normalRemaining: number;
  periods: PeriodStatus[];
  buckets: BucketStatus[];
  /** Fins de semana (sábado ISO) que ainda contam até o fim do mês. */
  weekends: string[];
  /** Sobra por fim de semana: total e por bucket. */
  perWeekend: { total: number; byBucket: Partial<Record<Bucket, number>> } | null;
}

/**
 * Fins de semana restantes no mês, identificados pelo sábado.
 * O fim de semana conta se o sábado é do mês e o domingo ainda não passou.
 */
export function remainingWeekends(today: string, skipped: string[] = []): string[] {
  const month = monthOf(today);
  const last = lastDayOfMonth(month);
  // primeiro sábado >= hoje-1 (se hoje é domingo, o sábado de ontem ainda conta)
  let d = addDays(today, -1);
  while (weekday(d) !== 6) d = addDays(d, 1);
  const out: string[] = [];
  for (; d <= last; d = addDays(d, 7)) {
    if (monthOf(d) === month && !skipped.includes(d)) out.push(d);
  }
  return out;
}

/** Todos os fins de semana do mês (sábado ISO), do primeiro ao último sábado. */
export function monthWeekends(month: string): string[] {
  let d = month;
  while (weekday(d) !== 6) d = addDays(d, 1);
  const out: string[] = [];
  for (const last = lastDayOfMonth(month); d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

/**
 * Fins de semana do mês que ainda podem receber gasto, ANTES de tirar os "sem gasto":
 * mês atual = os que faltam; mês futuro = todos; mês passado = nenhum.
 */
export function upcomingWeekends(month: string, today: string): string[] {
  const current = monthOf(today);
  if (month === current) return remainingWeekends(today);
  return month > current ? monthWeekends(month) : [];
}

/** Fins de semana que CONTAM para o ritmo: os que ainda vêm, menos os marcados "sem gasto". */
export function countingWeekends(month: string, today: string, skipped: string[] = []): string[] {
  return upcomingWeekends(month, today).filter((d) => !skipped.includes(d));
}

/**
 * Transações que entram no gasto do dia a dia do mês: a MESMA lista que o monthStatus soma.
 * O detalhe (MCP detalhe_dia_a_dia, tela) usa esta função para bater centavo a centavo com o resumo.
 */
export function dailyTransactions<T extends TransactionLike>(transactions: T[], ctx: { month: string; today: string; controlStart?: string | null }): T[] {
  return transactions.filter((t) => countsInDaily(t, { month: ctx.month, controlStart: ctx.controlStart, today: ctx.today }));
}

export function monthStatus(params: {
  today: string;
  capCents: number;
  allocations: { bucket: Bucket; amount_cents: number }[];
  transactions: TransactionLike[];
  skippedWeekends?: string[];
  /** início do controle no mês (null = dia 1) */
  controlStart?: string | null;
  /** mês consultado (padrão: o mês de `today`) */
  month?: string;
  periods?: PeriodLike[];
}): MonthStatus {
  const month = params.month ?? monthOf(params.today);
  // mesma regra da projeção e do MCP: lazer/mercado do início do controle até hoje
  const txs = dailyTransactions(params.transactions, { month, controlStart: params.controlStart, today: params.today });
  const spent = txs.reduce((s, t) => s + t.amount_cents, 0);
  const buckets = params.allocations.map((a) => {
    const bSpent = txs.filter((t) => t.bucket === a.bucket).reduce((s, t) => s + t.amount_cents, 0);
    return { bucket: a.bucket, budgeted: a.amount_cents, spent: bSpent, remaining: a.amount_cents - bSpent };
  });
  const remaining = params.capCents - spent;

  // períodos especiais: gasto com data dentro do período sai do teto dele; o estouro volta para o normal
  const periodList = params.periods ?? [];
  const inPeriod = (t: { occurred_on: string }) => periodList.some((p) => t.occurred_on >= p.start_date && t.occurred_on <= p.end_date);
  const periods = periodList.map((p) => {
    const pSpent = txs.filter((t) => t.occurred_on >= p.start_date && t.occurred_on <= p.end_date).reduce((s, t) => s + t.amount_cents, 0);
    return { name: p.name, start: p.start_date, end: p.end_date, cap: p.cap_cents, spent: pSpent, remaining: p.cap_cents - pSpent };
  });
  const reserved = periods.reduce((s, p) => s + p.cap, 0);
  const overflow = periods.reduce((s, p) => s + Math.max(0, -p.remaining), 0);
  const normalTx = txs.filter((t) => !inPeriod(t));
  const normalSpent = normalTx.reduce((s, t) => s + t.amount_cents, 0);
  const normalRemaining = params.capCents - reserved - normalSpent - overflow;

  const weekends = countingWeekends(month, params.today, params.skippedWeekends).filter((d) => !weekendInPeriods(d, periodList));
  const n = weekends.length;
  // por bucket: o orçado menos a parte proporcional dos períodos, menos o gasto normal do bucket
  const allocTotal = params.allocations.reduce((s, a) => s + a.amount_cents, 0);
  const bucketPool = (a: { bucket: Bucket; amount_cents: number }) => {
    const share = allocTotal ? a.amount_cents / allocTotal : 0;
    const bSpent = normalTx.filter((t) => t.bucket === a.bucket).reduce((s, t) => s + t.amount_cents, 0);
    return a.amount_cents - Math.round((reserved + overflow) * share) - bSpent;
  };
  const perWeekend = n
    ? {
        total: Math.floor(Math.max(normalRemaining, 0) / n),
        byBucket: Object.fromEntries(params.allocations.map((a) => [a.bucket, Math.floor(Math.max(bucketPool(a), 0) / n)])),
      }
    : null;
  return { cap: params.capCents, spent, remaining, normalRemaining, periods, buckets, weekends, perWeekend };
}

/** Orçamento do mês como vem do banco (monthly_budgets + alocações). */
export interface BudgetLike {
  month: string;
  cap_cents: number;
  control_start: string | null;
  skipped_weekends: string[];
  allocations: { bucket: Bucket; amount_cents: number }[];
  periods?: PeriodLike[];
}

/**
 * Situação do dia a dia de um mês: a MESMA conta para a Visão geral, resumo_do_mes, lancar_gasto,
 * simular_compra e detalhe_dia_a_dia. `today` posterior ao fim do mês = mês fechado.
 */
export function budgetStatus(budget: BudgetLike, transactions: TransactionLike[], today: string): MonthStatus {
  return monthStatus({
    today,
    month: budget.month,
    controlStart: budget.control_start,
    capCents: budget.cap_cents,
    allocations: budget.allocations,
    transactions,
    skippedWeekends: budget.skipped_weekends,
    periods: budget.periods ?? [],
  });
}
