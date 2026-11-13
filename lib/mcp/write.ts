import "server-only";
import { budgetStatus } from "@/lib/budget";
import type { AllData } from "@/lib/data";
import { addDays, monthOf } from "@/lib/dates";

/** Escopos do token que chamou (vem do withMcpAuth). */
export function scopesOf(ctx: { http?: { authInfo?: { scopes?: string[] } } }): string[] {
  return ctx.http?.authInfo?.scopes ?? [];
}

export type Meio = "credito" | "debito" | "pix";
export type GastoBucket = "lazer" | "mercado" | "fixo" | "assinatura";

export interface GastoInput {
  valor: number;
  descricao: string;
  data?: string;
  bucket?: GastoBucket;
  meio?: Meio;
  cartao?: string;
  chave?: string;
}

export interface GastoRow {
  amount_cents: number;
  description: string;
  occurred_on: string;
  bucket: GastoBucket;
  method: Meio;
  account_id: string | null;
  idempotency_key: string | null;
}

/**
 * Valida e monta o lançamento manual (mesmo formato do "+ Gasto" do painel).
 * Meio padrão = o do dia a dia do mês. Cartão só vale no crédito.
 */
export function buildGasto(
  d: Pick<AllData, "budgets" | "accounts">,
  input: GastoInput,
  today: string,
  findCard: (name: string) => { id: string; name: string } | null | undefined,
): { row: GastoRow; cartao: string | null } | { erro: string; cartoes?: string[] } {
  const cents = Math.round(input.valor * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 10_000_000) return { erro: "Valor inválido (entre 0,01 e 100.000)." };
  const description = input.descricao.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!description) return { erro: "Descrição obrigatória." };
  const date = input.data ?? today;
  if (date > today) return { erro: "Data no futuro: lance só gastos que já aconteceram (para planejar, use simular_compra)." };
  if (date < addDays(today, -90)) return { erro: "Data com mais de 90 dias: lance pelo painel." };

  const budget = d.budgets.find((b) => b.month === monthOf(date));
  const method: Meio = input.meio ?? (budget?.method === "credito" || input.cartao ? "credito" : "pix");
  let accountId: string | null = null;
  let cartao: string | null = null;
  if (input.cartao) {
    if (method !== "credito") return { erro: "Cartão só vale para meio crédito." };
    const card = findCard(input.cartao);
    if (!card) return { erro: `Cartão "${input.cartao}" não encontrado.`, cartoes: d.accounts.filter((a) => a.kind === "credit_card").map((a) => a.name.trim()) };
    accountId = card.id;
    cartao = card.name.trim();
  }
  const key = input.chave?.trim() || null;
  return {
    row: { amount_cents: cents, description, occurred_on: date, bucket: input.bucket ?? "lazer", method, account_id: accountId, idempotency_key: key },
    cartao,
  };
}

/** "Ainda posso gastar" e ritmo do mês do gasto: a mesma função do resumo_do_mes. null se o mês não tem dia a dia. */
export function remainingFor(d: Pick<AllData, "budgets" | "transactions">, date: string, today: string) {
  const budget = d.budgets.find((b) => b.month === monthOf(date));
  if (!budget) return null;
  const st = budgetStatus(budget, d.transactions, today);
  const period = st.periods.find((p) => date >= p.start && date <= p.end) ?? null;
  return { mes: budget.month.slice(0, 7), cents: st.remaining, perWeekend: st.perWeekend, weekends: st.weekends, periods: st.periods, normalRemaining: st.normalRemaining, period };
}
