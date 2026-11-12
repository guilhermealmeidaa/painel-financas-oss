import { addDays, lastDayOfMonth, monthOf, weekday } from "./dates";
import { countsInDaily, type Bucket, type TransactionLike } from "./projection";

export interface BucketStatus {
  bucket: Bucket;
  budgeted: number;
  spent: number;
  remaining: number;
}

export interface MonthStatus {
  cap: number;
  spent: number;
  remaining: number;
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
  const weekends = month === monthOf(params.today) ? remainingWeekends(params.today, params.skippedWeekends) : [];
  const n = weekends.length;
  const perWeekend = n
    ? {
        total: Math.floor(Math.max(remaining, 0) / n),
        byBucket: Object.fromEntries(buckets.map((b) => [b.bucket, Math.floor(Math.max(b.remaining, 0) / n)])),
      }
    : null;
  return { cap: params.capCents, spent, remaining, buckets, weekends, perWeekend };
}
