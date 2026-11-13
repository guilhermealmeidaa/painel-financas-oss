import "server-only";
import { monthStatus } from "@/lib/budget";
import { invoiceMonth } from "@/lib/cards";
import { runProjection, type AllData } from "@/lib/data";
import { addMonths, monthOf } from "@/lib/dates";
import { DAILY_BUCKETS, LOW_BALANCE_CENTS, type Bucket, type ProjectionRow } from "@/lib/projection";

export interface SimInput {
  totalCents: number;
  parcelas: number;
  /** id do cartão (null = sem cartão: usa o meio do dia a dia do mês) */
  cardId: string | null;
  date: string;
  bucket: Bucket;
  today: string;
}

const reais = (c: number) => Math.round(c) / 100;

/**
 * Simula uma compra SEM gravar nada.
 *
 * Parcelado (no cartão): entra como parcela do plano, com a 1ª parcela na fatura que o fechamento do
 * cartão indica para a data — é assim que uma compra parcelada cadastrada entra na projeção — e roda a MESMA projeção do painel.
 *
 * À vista: o teto do dia a dia já está reservado na projeção. Um gasto de lazer/mercado DENTRO do teto só
 * muda o "ainda posso gastar"; a projeção só muda pelo que PASSAR do teto, no mês em que é pago
 * (crédito: na fatura; débito/Pix: no próprio mês). Gasto fora do dia a dia (fixo, assinatura…) conta inteiro.
 * Sem cartão, o meio é o do dia a dia do mês.
 */
export function simulatePurchase(d: AllData, s: SimInput) {
  const card = s.cardId ? d.accounts.find((a) => a.id === s.cardId) : null;
  const month = monthOf(s.date);
  const budget = d.budgets.find((b) => b.month === month);
  const before = runProjection(d);

  if (s.parcelas > 1 && card) return installmentSim(d, s, card, before);

  const credit = card ? true : budget?.method === "credito";
  const meio = credit ? "crédito" : "débito/Pix";
  const isDaily = DAILY_BUCKETS.includes(s.bucket);

  // dia a dia do mês: mesma regra do resumo (monthStatus), com o gasto simulado
  const status = (extra: number) =>
    budget
      ? monthStatus({
          today: s.date > s.today ? s.date : s.today,
          month,
          controlStart: budget.control_start,
          capCents: budget.cap_cents,
          allocations: budget.allocations,
          transactions: extra
            ? [
                ...d.transactions,
                {
                  occurred_on: s.date,
                  amount_cents: extra,
                  bucket: s.bucket,
                  method: credit ? "credito" : "pix",
                  account_id: card?.id ?? null,
                } as AllData["transactions"][number],
              ]
            : d.transactions,
          skippedWeekends: budget.skipped_weekends,
        })
      : null;
  const st0 = isDaily ? status(0) : null;
  const st1 = isDaily ? status(s.totalCents) : null;

  // quanto sai a mais do dinheiro: dentro do teto = 0; o excedente sobre o teto; fora do dia a dia = tudo
  const over = (spent: number) => Math.max(0, spent - (budget?.cap_cents ?? 0));
  const impact = isDaily && st0 && st1 ? over(st1.spent) - over(st0.spent) : s.totalCents;
  const payMonth = credit ? (card ? invoiceMonth(s.date, card.closing_day, card.due_day) : addMonths(month, 1)) : month;
  const after = shift(before, payMonth, impact);

  return {
    compra: {
      valor_total: reais(s.totalCents),
      parcelas: 1,
      cartao: card?.name.trim() ?? null,
      meio,
      data: s.date,
      bucket: s.bucket,
    },
    faturas_afetadas: card ? [{ fatura: payMonth.slice(0, 7), parcela: null as string | null, valor: reais(s.totalCents) }] : [],
    dia_a_dia_do_mes:
      st0 && st1
        ? {
            mes: month.slice(0, 7),
            ainda_posso_gastar_antes: reais(st0.remaining),
            ainda_posso_gastar_depois: reais(st1.remaining),
            passa_do_teto_em: reais(Math.max(0, -st1.remaining)),
          }
        : null,
    efeito_na_projecao: impact
      ? `sai ${reais(impact).toFixed(2)} a mais em ${payMonth.slice(0, 7)} (${isDaily ? "o que passa do teto do dia a dia" : "fora do dia a dia, conta inteiro"})`
      : "nenhum: cabe no teto do dia a dia, que já está reservado na projeção",
    ...compare(before, after),
  };
}

/** Projeção com `cents` a menos a partir de `from` (saldo acumula; o resultado só muda no mês do pagamento). */
function shift(rows: ProjectionRow[], from: string, cents: number): ProjectionRow[] {
  if (!cents) return rows;
  return rows.map((r) => {
    if (r.month < from) return r;
    const net = r.month === from ? r.net - cents : r.net;
    const balance = r.balance - cents;
    return { ...r, net, balance, alerts: { negativeMonth: net < 0, lowBalance: balance < LOW_BALANCE_CENTS } };
  });
}

function compare(before: ProjectionRow[], after: ProjectionRow[]) {
  const byMonth = new Map(before.map((r) => [r.month, r]));
  return {
    projecao: after.map((a) => {
      const b = byMonth.get(a.month);
      return {
        mes: a.month.slice(0, 7),
        saldo_antes: b ? reais(b.balance) : null,
        saldo_depois: reais(a.balance),
        diferenca: b ? reais(a.balance - b.balance) : null,
        resultado_do_mes_depois: reais(a.net),
      };
    }),
    meses_negativos: after.filter((a) => a.alerts.negativeMonth).map((a) => a.month.slice(0, 7)),
    meses_abaixo_de_500: after.filter((a) => a.alerts.lowBalance).map((a) => a.month.slice(0, 7)),
    novos_meses_negativos: after.filter((a) => a.alerts.negativeMonth && !byMonth.get(a.month)?.alerts.negativeMonth).map((a) => a.month.slice(0, 7)),
    novos_meses_abaixo_de_500: after.filter((a) => a.alerts.lowBalance && !byMonth.get(a.month)?.alerts.lowBalance).map((a) => a.month.slice(0, 7)),
  };
}

function installmentSim(d: AllData, s: SimInput, card: AllData["accounts"][number], before: ProjectionRow[]) {
  const per = Math.round(s.totalCents / s.parcelas);
  const firstInvoice = invoiceMonth(s.date, card.closing_day, card.due_day);
  const sim: AllData = {
    ...d,
    installments: [
      ...d.installments,
      {
        id: "simulacao",
        user_id: card.user_id,
        name: "Compra simulada",
        total_cents: s.totalCents,
        installments_count: s.parcelas,
        installment_cents: per,
        first_invoice_month: firstInvoice,
        account_id: card.id,
        status: "ativa",
        notes: null,
        created_at: new Date().toISOString(),
        covered_by_bank: false,
        matched_tx_id: null,
        purchase_date: s.date,
      } as AllData["installments"][number],
    ],
  };
  const after = runProjection(sim);
  return {
    compra: {
      valor_total: reais(s.totalCents),
      parcelas: s.parcelas,
      valor_da_parcela: reais(per),
      ...(per * s.parcelas !== s.totalCents ? { observacao: `arredondado: ${s.parcelas} × ${reais(per).toFixed(2)} = ${reais(per * s.parcelas).toFixed(2)}` } : {}),
      cartao: card.name.trim(),
      meio: "crédito",
      data: s.date,
      bucket: s.bucket,
    },
    faturas_afetadas: Array.from({ length: s.parcelas }, (_, i) => ({ fatura: addMonths(firstInvoice, i).slice(0, 7), parcela: `${i + 1}/${s.parcelas}`, valor: reais(per) })),
    dia_a_dia_do_mes: null,
    efeito_na_projecao: "compra parcelada não entra no dia a dia: cada parcela sai na fatura do cartão",
    ...compare(before, after),
  };
}
