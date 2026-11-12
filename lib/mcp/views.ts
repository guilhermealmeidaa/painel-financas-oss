/**
 * Montagem das respostas de diagnóstico do MCP (puro, testável).
 * Regra de ouro: NADA é recalculado aqui. Os detalhes saem das mesmas funções que geram os totais
 * (invoicesForMonth, dailyTransactions, monthStatus), então sempre batem centavo a centavo.
 */
import { dailyTransactions, monthStatus } from "../budget";
import { addDays, monthOf } from "../dates";
import type { CardInvoice, InvoiceItem } from "../invoices";
import type { Bucket } from "../projection";

export const reais = (cents: number) => Math.round(cents) / 100;

const ORIGEM: Record<InvoiceItem["origin"], string> = {
  banco: "banco",
  calculada: "calculada",
  projetada: "projetada",
  plano: "plano",
  estimativa: "estimativa",
};

// ---------- detalhe_fatura ----------

export interface BillInfo {
  due_date: string;
  total_cents: number;
  status: string | null;
  paid_cents?: number | null;
  payment_tx_id?: string | null;
}

export function invoiceDetail(card: CardInvoice, opts: { bills: BillInfo[]; paid: boolean; paymentIds: string[] }) {
  const composicao = card.lines.map((l) => {
    const itens = (l.items ?? []).map((i) => ({
      id: i.id,
      data: i.date,
      descricao: i.description,
      valor: reais(i.cents),
      parcela: i.installment,
      origem: ORIGEM[i.origin],
    }));
    const soma = (l.items ?? []).reduce((s, i) => s + i.cents, 0);
    return {
      item: l.label,
      valor: reais(l.cents),
      quantidade: itens.length,
      ...(soma !== l.cents ? { aviso: `itens somam ${reais(soma)}, linha soma ${reais(l.cents)}` } : {}),
      ids: itens.map((i) => i.id).filter((x): x is string => Boolean(x)),
      itens,
    };
  });
  const real = opts.bills.length ? opts.bills.reduce((s, b) => s + b.total_cents, 0) : null;
  return {
    cartao: card.name,
    total: reais(card.total),
    valor_real_do_banco: real != null ? reais(real) : null,
    observacao_valor_real:
      real != null ? "valor que a Pluggy informou para a fatura; em vários bancos é o SALDO que falta pagar, não o total de compras" : null,
    paga: opts.paid,
    pagamentos_casados: opts.paymentIds,
    composicao,
  };
}

// ---------- detalhe_dia_a_dia ----------

interface DailyTx {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  bucket: Bucket;
  method: "credito" | "debito" | "pix";
  account_id: string | null;
  source: string;
}

export function dailyDetail(
  params: {
    month: string;
    today: string;
    budget: { cap_cents: number; control_start: string | null; allocations: { bucket: Bucket; amount_cents: number }[]; skipped_weekends?: string[] } | null;
    transactions: DailyTx[];
    accountName: (id: string | null) => string | null;
  },
  labels: Record<string, string>,
) {
  const { month, today, budget } = params;
  const ctx = { month, today, controlStart: budget?.control_start ?? null };
  const txs = dailyTransactions(params.transactions, ctx);
  const status = budget
    ? monthStatus({
        today,
        month,
        controlStart: budget.control_start,
        capCents: budget.cap_cents,
        allocations: budget.allocations,
        transactions: params.transactions,
        skippedWeekends: budget.skipped_weekends,
      })
    : null;
  const byBucket = new Map<Bucket, number>();
  for (const t of txs) byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.amount_cents);
  const total = txs.reduce((s, t) => s + t.amount_cents, 0);
  return {
    mes: month.slice(0, 7),
    regra: "lazer/mercado do início do controle até hoje (compras com data futura ainda não contam)",
    conta_a_partir_de: budget?.control_start ?? month,
    ate: today < month ? null : today,
    total: reais(total),
    total_por_bucket: [...byBucket.entries()].map(([b, c]) => ({ bucket: labels[b] ?? b, valor: reais(c) })),
    // mesmo número que resumo_do_mes.dia_a_dia.gasto (garantido por teste)
    bate_com_resumo: status ? status.spent === total : null,
    quantidade: txs.length,
    itens: [...txs]
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.amount_cents - a.amount_cents)
      .map((t) => ({
        id: t.id,
        data: t.occurred_on,
        descricao: t.description,
        valor: reais(t.amount_cents),
        bucket: labels[t.bucket] ?? t.bucket,
        conta: params.accountName(t.account_id),
        meio: t.method,
        origem: t.source === "manual" ? "manual" : "banco",
      })),
  };
}

// ---------- saude ----------

export interface HealthInput {
  now: Date;
  today: string;
  accounts: { id: string; name: string; kind: string; pluggy_account_id: string | null; pluggy_item_id: string | null; synced_at: string | null }[];
  items: { item_id: string; connector_name: string | null; status: string | null; last_synced_at: string | null }[];
  transactions: { id: string; occurred_on: string; description: string; amount_cents: number; bucket: string; source: string; manual_id: string | null; is_inflow: boolean; account_id: string | null }[];
  installments: { id: string; name: string; status: string; installment_cents: number; installments_count: number; first_invoice_month: string; account_id: string | null }[];
  coveredInstallmentIds: Set<string>;
  /** faturas já pagas com o total reconstruído pelo painel (compras + parcelas ligadas à fatura) */
  paidBills: { account_id: string; due_date: string; paid_cents: number; reconstructed_cents: number }[];
}

const STALE_HOURS = 36;

export function healthReport(h: HealthInput) {
  const name = new Map(h.accounts.map((a) => [a.id, a.name]));
  const itemById = new Map(h.items.map((i) => [i.item_id, i]));
  const alertas: string[] = [];

  const contas = h.accounts.map((a) => {
    const item = a.pluggy_item_id ? itemById.get(a.pluggy_item_id) : undefined;
    const last = a.synced_at ?? item?.last_synced_at ?? null;
    const hours = last ? (h.now.getTime() - Date.parse(last)) / 3_600_000 : null;
    const erro = item?.status && !["UPDATED", "UPDATING", "ok"].includes(item.status);
    const status = !a.pluggy_account_id ? "sem_banco" : erro ? "erro" : hours == null || hours > STALE_HOURS ? "atrasado" : "ok";
    if (status === "erro") alertas.push(`${a.name}: a conexão com o banco está com erro (${item?.status}). Reconecte em Conexões.`);
    if (status === "atrasado") alertas.push(`${a.name}: sem sincronizar há mais de ${STALE_HOURS} h.`);
    return {
      conta: a.name,
      tipo: a.kind === "credit_card" ? "cartão" : "conta corrente",
      conectada_ao_banco: Boolean(a.pluggy_account_id),
      // cartão cadastrado à mão e ainda não ligado a nenhum cartão do banco
      ligado_ao_cadastro: a.kind !== "credit_card" || Boolean(a.pluggy_account_id),
      ultimo_sync: last,
      status_sync: status,
    };
  });
  const naoLigados = contas.filter((c) => c.tipo === "cartão" && !c.conectada_ao_banco);
  if (naoLigados.length) alertas.push(`Cartões cadastrados sem ligação com o banco: ${naoLigados.map((c) => c.conta).join(", ")}.`);

  const pend = h.transactions.filter((t) => t.bucket === "sem_categoria");
  const pendTotal = pend.reduce((s, t) => s + t.amount_cents, 0);
  if (pend.length) alertas.push(`${pend.length} gastos sem categoria (${reais(pendTotal).toFixed(2)}) fora das contas. Classifique na Triagem.`);

  const semPar = h.installments
    .filter((i) => i.status === "ativa" && !h.coveredInstallmentIds.has(i.id))
    .map((i) => ({ id: i.id, nome: i.name, parcela: reais(i.installment_cents), parcelas: i.installments_count, primeira_fatura: i.first_invoice_month.slice(0, 7), cartao_informado: i.account_id ? (name.get(i.account_id) ?? null) : null }));
  if (semPar.length) alertas.push(`Parcelas do plano ainda sem par no banco (contam como estimativa): ${semPar.map((p) => p.nome).join(", ")}.`);

  const linked = new Set(h.transactions.filter((t) => t.manual_id).map((t) => t.manual_id!));
  const limite = addDays(h.today, -3);
  const desde = addDays(h.today, -60);
  const manuais = h.transactions
    .filter((t) => t.source === "manual" && !t.is_inflow && t.occurred_on <= limite && t.occurred_on >= desde && !linked.has(t.id))
    .map((t) => ({ id: t.id, data: t.occurred_on, descricao: t.description, valor: reais(t.amount_cents), conta: t.account_id ? (name.get(t.account_id) ?? null) : null }));
  if (manuais.length) alertas.push(`${manuais.length} lançamentos manuais com mais de 3 dias sem a transação do banco correspondente.`);

  const faturas = h.paidBills.map((b) => {
    const dif = b.paid_cents - b.reconstructed_cents;
    const r = {
      cartao: name.get(b.account_id) ?? b.account_id,
      mes: monthOf(b.due_date).slice(0, 7),
      reconstruida: reais(b.reconstructed_cents),
      paga: reais(b.paid_cents),
      diferenca: reais(dif),
    };
    if (Math.abs(dif) > 100) {
      const why =
        dif > 0
          ? "Faltam compras do banco ligadas a essa fatura (o banco não mandou todas, ou caíram em outro mês)."
          : "O pagamento casado é menor: provavelmente houve pagamentos antes do fechamento, ou o banco informa só o saldo que faltava.";
      alertas.push(`Fatura ${r.cartao} ${r.mes}: reconstruída ${r.reconstruida.toFixed(2)} × paga ${r.paga.toFixed(2)} (diferença ${r.diferenca.toFixed(2)}). ${why}`);
    }
    return r;
  });

  return {
    contas,
    sem_categoria: { quantidade: pend.length, total: reais(pendTotal) },
    parcelas_do_plano_sem_par: semPar,
    manuais_sem_par: manuais,
    faturas_reconstruidas_vs_pagas: faturas,
    alertas,
  };
}
