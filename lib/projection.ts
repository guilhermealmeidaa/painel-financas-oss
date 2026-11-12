import { monthOf, monthsBetween, monthRange } from "./dates";

/**
 * Lógica pura da projeção (sem banco), para poder testar.
 *
 * Saldo do mês = saldo anterior
 *   + entradas
 *   − fixos
 *   − fatura do crédito do dia a dia do mês anterior
 *   − dia a dia no débito/Pix do mês
 *   − parcelas das compras parceladas novas
 *
 * Dia a dia: usa o MAIOR entre o teto do orçamento e o gasto real já lançado
 * (se estourar o teto, a projeção piora; se gastar menos, o teto continua
 * reservado até o mês acabar).
 */

export type BudgetMethod = "credito" | "debito_pix";
export type PaymentMethod = "credito" | "debito" | "pix";
export type Bucket = "lazer" | "mercado" | "fixo" | "assinatura" | "parcela" | "ignorar" | "sem_categoria";

/**
 * Buckets que contam como "dia a dia" (o resto já está em fixos/parcelas ou é ignorado).
 * "sem_categoria" fica de fora até ser classificado na Triagem: com o banco conectado,
 * pagamento de fatura, transferência entre contas e contas fixas chegam sem categoria
 * e distorceriam a conta. O painel mostra um aviso com o total pendente.
 */
export const DAILY_BUCKETS: Bucket[] = ["lazer", "mercado"];

export interface MonthAmount {
  month: string; // "YYYY-MM-01"
  amount_cents: number;
}

export interface InstallmentLike {
  installment_cents: number;
  installments_count: number;
  first_invoice_month: string;
  status: "ativa" | "planejada" | "quitada";
}

export interface BudgetLike {
  month: string;
  cap_cents: number;
  method: BudgetMethod;
  /** início do controle do dia a dia no mês (null = dia 1) */
  control_start?: string | null;
}

export interface TransactionLike {
  occurred_on: string;
  amount_cents: number;
  method: PaymentMethod;
  bucket: Bucket;
}

export interface ProjectionInput {
  start: string;
  end: string;
  openingBalanceCents: number;
  incomes: MonthAmount[];
  fixedExpenses: MonthAmount[];
  installments: InstallmentLike[];
  budgets: BudgetLike[];
  transactions: TransactionLike[];
  /** Incluir compras com status "planejada" (ex.: presente ainda não comprado). */
  includePlanned?: boolean;
  /**
   * Total das faturas de cartão por mês de vencimento (modelo "real primeiro", ver invoices.ts).
   * Quando vem preenchido, substitui fatura do crédito + parcelas: `fixedExpenses` deve vir SEM os
   * fixos de cartão e `installments` não são somadas (já estão nas faturas).
   */
  cardTotals?: Map<string, number>;
  /** Saídas reais fora do cartão sem fixo cadastrado ("fixo avulso", assinatura na conta) e assinaturas projetadas. */
  extraOutflows?: MonthAmount[];
  /** hoje: gasto com data futura não conta no dia a dia */
  today?: string;
  /**
   * Mês atual ancorado no saldo real das contas (ver anchor.ts). Nesse mês só entra o que ainda
   * não aconteceu; os meses seguintes partem do saldo ancorado.
   */
  anchor?: {
    month: string;
    opening: number;
    pendingIncome: number;
    unpaidFixed: number;
    unpaidCards: number;
    dailyRemaining: number;
    balance: number;
  };
}

export interface ProjectionRow {
  month: string;
  income: number;
  fixed: number;
  /** Fatura do crédito do dia a dia do mês anterior. */
  creditInvoice: number;
  /** Dia a dia pago no débito/Pix neste mês. */
  daily: number;
  /** Quanto do dia a dia deste mês foi no crédito (vai para a fatura do mês seguinte). */
  dailyOnCredit: number;
  installments: number;
  /** Fixos avulsos e assinaturas fora do cartão (reais ou projetadas). */
  extras: number;
  /** Mês ancorado: saldo real das contas hoje (o resto da linha é só o que ainda falta acontecer). */
  opening?: number;
  /** Resultado do mês sozinho (sem o saldo anterior). */
  net: number;
  balance: number;
  alerts: { negativeMonth: boolean; lowBalance: boolean };
}

export const LOW_BALANCE_CENTS = 50_000;

export function installmentAmountInMonth(p: InstallmentLike, month: string): number {
  const k = monthsBetween(p.first_invoice_month, month);
  return k >= 0 && k < p.installments_count ? p.installment_cents : 0;
}

/** Último mês de fatura da compra parcelada. */
export function installmentEndMonth(p: InstallmentLike): string {
  const [y, m] = [Number(p.first_invoice_month.slice(0, 4)), Number(p.first_invoice_month.slice(5, 7))];
  const total = y * 12 + (m - 1) + p.installments_count - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

function sumByMonth(items: MonthAmount[], month: string): number {
  return items.reduce((s, i) => (i.month === month ? s + i.amount_cents : s), 0);
}

/** Gasto real do dia a dia de um mês, separado por crédito e débito/Pix. */
export interface DailyContext {
  month: string;
  /** início do controle no mês (AAAA-MM-DD); antes disso não conta */
  controlStart?: string | null;
  /** hoje (AAAA-MM-DD); compra com data futura ainda não aconteceu e não conta */
  today?: string;
}

/**
 * FONTE ÚNICA do que conta no dia a dia: lazer ou mercado, no mês, do início do controle até hoje.
 * Usada pelo painel, pela projeção, pelas faturas (reserva do teto) e pelas ferramentas do MCP.
 */
export function countsInDaily(t: TransactionLike, ctx: DailyContext): boolean {
  return (
    monthOf(t.occurred_on) === ctx.month &&
    DAILY_BUCKETS.includes(t.bucket) &&
    (!ctx.controlStart || t.occurred_on >= ctx.controlStart) &&
    (!ctx.today || t.occurred_on <= ctx.today)
  );
}

export function actualDaily(transactions: TransactionLike[], month: string, ctx: Omit<DailyContext, "month"> = {}) {
  let credit = 0;
  let debit = 0;
  for (const t of transactions) {
    if (!countsInDaily(t, { ...ctx, month })) continue;
    if (t.method === "credito") credit += t.amount_cents;
    else debit += t.amount_cents;
  }
  return { credit, debit };
}

/** Quanto do dia a dia de um mês sai no crédito e quanto sai no débito/Pix. */
export function dailySplit(
  budgets: BudgetLike[],
  transactions: TransactionLike[],
  month: string,
  today?: string,
): { credit: number; debit: number } {
  const b = budgets.find((x) => x.month === month);
  const actual = actualDaily(transactions, month, { controlStart: b?.control_start ?? null, today });
  if (!b) return actual;
  if (b.method === "credito") {
    return { credit: Math.max(b.cap_cents - actual.debit, actual.credit), debit: actual.debit };
  }
  return { credit: actual.credit, debit: Math.max(b.cap_cents - actual.credit, actual.debit) };
}

export function project(input: ProjectionInput): ProjectionRow[] {
  const installments = input.installments.filter(
    (p) => p.status === "ativa" || p.status === "quitada" || (input.includePlanned && p.status === "planejada"),
  );
  const rows: ProjectionRow[] = [];
  let balance = input.openingBalanceCents;
  let prevCredit = 0;

  for (const month of monthRange(input.start, input.end)) {
    const income = sumByMonth(input.incomes, month);
    const fixed = sumByMonth(input.fixedExpenses, month);
    const split = dailySplit(input.budgets, input.transactions, month, input.today);
    const inst = input.cardTotals ? 0 : installments.reduce((s, p) => s + installmentAmountInMonth(p, month), 0);
    const creditInvoice = input.cardTotals ? (input.cardTotals.get(month) ?? 0) : prevCredit;
    const a = input.anchor && input.anchor.month === month ? input.anchor : null;
    if (a) {
      // mês atual: parte do saldo real; só o que ainda não aconteceu
      const net = a.pendingIncome - a.unpaidFixed - a.unpaidCards - a.dailyRemaining;
      balance = a.balance;
      rows.push({
        month,
        income: a.pendingIncome,
        fixed: a.unpaidFixed,
        creditInvoice: a.unpaidCards,
        daily: a.dailyRemaining,
        dailyOnCredit: split.credit,
        installments: 0,
        extras: 0,
        opening: a.opening,
        net,
        balance,
        alerts: { negativeMonth: net < 0, lowBalance: balance < LOW_BALANCE_CENTS },
      });
      prevCredit = split.credit;
      continue;
    }
    const extras = sumByMonth(input.extraOutflows ?? [], month);
    const net = income - fixed - creditInvoice - split.debit - inst - extras;
    balance += net;
    rows.push({
      month,
      income,
      fixed,
      creditInvoice,
      daily: split.debit,
      dailyOnCredit: split.credit,
      installments: inst,
      extras,
      net,
      balance,
      alerts: { negativeMonth: net < 0, lowBalance: balance < LOW_BALANCE_CENTS },
    });
    prevCredit = split.credit;
  }
  return rows;
}
