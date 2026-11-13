/**
 * Mês atual ancorado no SALDO REAL das contas (puro, testável).
 *
 * saldo_no_fim(mês atual) = saldo de hoje nas contas
 *   + entradas previstas que ainda não entraram
 *   − fixos ainda não pagos
 *   − faturas que vencem no mês e ainda não foram pagas
 *   − dia a dia no débito/Pix que ainda falta gastar
 *
 * O que já entrou ou já saiu está dentro do saldo de hoje e não é contado de novo.
 * Os meses seguintes continuam a conta normal a partir desse saldo.
 */
export interface AnchorInput {
  /** soma dos saldos das contas correntes (Pluggy), em centavos */
  balanceCents: number;
  /** entradas planejadas do mês (manuais) */
  plannedIncomes: { amount_cents: number; description: string }[];
  /** entradas que já vieram do banco no mês (já estão no saldo) */
  bankIncomes: { amount_cents: number }[];
  /** contas a pagar do mês ainda não pagas (fixos e faturas) */
  unpaidBills: { cents: number; kind: string; name: string }[];
  /** teto do dia a dia no mês, meio e quanto já foi gasto (regra única do dia a dia) */
  budget: { cap_cents: number; method: "credito" | "debito_pix" } | null;
  dailySpentCents: number;
}

export interface Anchor {
  opening: number;
  pendingIncome: number;
  unpaidFixed: number;
  unpaidCards: number;
  dailyRemaining: number;
  balance: number;
  pendingIncomeItems: string[];
}

/** Entrada planejada já recebida = existe entrada do banco no mês com valor a até 5% dela. */
export function pendingIncomes<P extends AnchorInput["plannedIncomes"][number]>(planned: P[], bank: AnchorInput["bankIncomes"]): P[] {
  const free = [...bank];
  const pending: P[] = [];
  for (const p of planned) {
    const i = free.findIndex((b) => Math.abs(b.amount_cents - p.amount_cents) <= p.amount_cents * 0.05);
    if (i >= 0) free.splice(i, 1);
    else pending.push(p);
  }
  return pending;
}

export function anchorCurrentMonth(a: AnchorInput): Anchor {
  const pend = pendingIncomes(a.plannedIncomes, a.bankIncomes);
  const pendingIncome = pend.reduce((s, p) => s + p.amount_cents, 0);
  const unpaidFixed = a.unpaidBills.filter((b) => b.kind !== "fatura").reduce((s, b) => s + b.cents, 0);
  const unpaidCards = a.unpaidBills.filter((b) => b.kind === "fatura").reduce((s, b) => s + b.cents, 0);
  // no crédito, o que falta do teto vai para a fatura do mês seguinte (reserva), não sai da conta agora
  const dailyRemaining = a.budget && a.budget.method === "debito_pix" ? Math.max(a.budget.cap_cents - a.dailySpentCents, 0) : 0;
  return {
    opening: a.balanceCents,
    pendingIncome,
    unpaidFixed,
    unpaidCards,
    dailyRemaining,
    balance: a.balanceCents + pendingIncome - unpaidFixed - unpaidCards - dailyRemaining,
    pendingIncomeItems: pend.map((p) => p.description),
  };
}
