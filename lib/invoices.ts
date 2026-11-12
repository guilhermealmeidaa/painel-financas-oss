import { allocateBySequence, coveredSeedInstallments, synthesizeInstallments, txInvoiceMonth, type CardTx } from "./cards";
import { addMonths, lastDayOfMonth, monthsBetween } from "./dates";
import { countsInDaily, dailySplit, installmentAmountInMonth, type BudgetLike, type InstallmentLike, type TransactionLike } from "./projection";
import { subscriptionKey } from "./subscriptions";

/** Item que compõe uma linha da fatura (para "abrir" o número: detalhe_fatura no MCP). */
export interface InvoiceItem {
  /** id da transação do banco; null para o que é calculado ou estimado */
  id: string | null;
  date: string | null;
  description: string;
  cents: number;
  installment: string | null;
  origin: "banco" | "calculada" | "projetada" | "plano" | "estimativa";
}
export interface InvoiceLine {
  label: string;
  cents: number;
  items?: InvoiceItem[];
}
export interface CardInvoice {
  accountId: string | null;
  name: string;
  total: number;
  lines: InvoiceLine[];
  /** fatura já fechada no banco */
  real?: boolean;
  /** cartão ligado ao banco: valor = compras reais, não estimativa */
  fromBank?: boolean;
  /** linha de estimativa (reserva do teto) */
  estimate?: boolean;
}

export interface InvoiceCard {
  id: string;
  name: string;
  /** ligado ao banco (Pluggy): fatura vem das compras reais */
  pluggy_account_id?: string | null;
  closing_day?: number | null;
  due_day?: number | null;
}

type InvTx = TransactionLike & {
  id?: string;
  account_id: string | null;
  source?: string;
  is_inflow?: boolean;
  description?: string;
  installment_number?: number | null;
  total_installments?: number | null;
  pluggy_bill_id?: string | null;
  auto_reason?: string | null;
  pluggy_status?: string | null;
};

export interface InvoiceParams {
  month: string; // mês da fatura (vencimento)
  cards: InvoiceCard[];
  fixed: { month: string; name: string; category: string; account_id: string | null; amount_cents: number }[];
  installments: (InstallmentLike & { id?: string; name: string; account_id: string | null; purchase_date?: string | null })[];
  transactions: InvTx[];
  budgets: BudgetLike[];
  /** Faturas do banco (Pluggy). Atenção: o "total" da Pluggy costuma ser o SALDO depois dos pagamentos. */
  realBills?: { account_id: string; due_date: string; total_cents: number; pluggy_bill_id?: string | null; closing_date?: string | null }[];
  /** Hoje (AAAA-MM-DD). Reserva do teto só existe enquanto o mês do crédito não acabou; parcelas futuras = depois de hoje. */
  today?: string;
  includePlanned?: boolean;
}

const isLinked = (c: InvoiceCard) => Boolean(c.pluggy_account_id);

/** Prepara o que é caro: mês de fatura de cada compra, parcelas calculadas, compras do plano cobertas, assinaturas. */
export function prepareInvoices(p: Omit<InvoiceParams, "month">) {
  const linked = new Map(p.cards.filter(isLinked).map((c) => [c.id, c]));
  const billDue = new Map(
    (p.realBills ?? []).filter((b) => b.pluggy_bill_id).map((b) => [b.pluggy_bill_id!, `${b.due_date.slice(0, 7)}-01`]),
  );
  const asCard = (t: InvTx): CardTx => ({
    id: t.id ?? `${t.account_id}|${t.occurred_on}|${t.amount_cents}|${t.description}`,
    account_id: t.account_id,
    occurred_on: t.occurred_on,
    description: t.description ?? "",
    amount_cents: t.amount_cents,
    installment_number: t.installment_number ?? null,
    total_installments: t.total_installments ?? null,
    pluggy_bill_id: t.pluggy_bill_id ?? null,
  });
  const bankCardTx = p.transactions.filter((t) => t.account_id && linked.has(t.account_id) && !t.is_inflow && t.bucket !== "ignorar");
  const cardRows = bankCardTx.map((t) => ({ ...asCard(t), bucket: t.bucket, auto_reason: t.auto_reason ?? null, pending: t.pluggy_status === "PENDING" }));
  const byDate = (t: CardTx) => {
    const c = linked.get(t.account_id!);
    return txInvoiceMonth(t, c ? { closing_day: c.closing_day ?? null, due_day: c.due_day ?? null } : undefined, billDue);
  };
  // parcelas: pela sequência (uma por mês); compras à vista: pela data/fatura do banco
  const bySeq = allocateBySequence(cardRows, byDate, (t) => Boolean(t.pluggy_bill_id && billDue.has(t.pluggy_bill_id)));
  // faturas que o banco já fechou (existe bill da Pluggy com vencimento no mês), por cartão
  const closed = new Set((p.realBills ?? []).map((b) => `${b.account_id}|${b.due_date.slice(0, 7)}-01`));
  /**
   * Compra pendente, sem bill id, cuja fatura pela data já fechou no banco: não entrou nela
   * (ex.: Pix no crédito de 06–07/11 num cartão que fecha dia 7) → vai para a próxima fatura aberta.
   */
  const openMonth = (t: (typeof cardRows)[number], m: string) => {
    if (!t.pending || t.pluggy_bill_id) return m;
    let month = m;
    for (let i = 0; i < 3 && closed.has(`${t.account_id}|${month}`); i++) month = addMonths(month, 1);
    return month;
  };
  const withMonth = cardRows.map((t) => ({ ...t, invoice_month: bySeq.get(t.id) ?? openMonth(t, byDate(t)) }));

  // cartões que já mandam parcelas futuras (data depois de hoje): nada é calculado para eles
  const today = p.today ?? "9999-12-31";
  const withFuture = new Set(withMonth.filter((t) => (t.total_installments ?? 0) > 1 && t.occurred_on > today).map((t) => t.account_id!));
  const virtual = synthesizeInstallments(withMonth, (t) => (t as (typeof withMonth)[number]).invoice_month, withFuture);
  const covered = coveredSeedInstallments(
    p.installments.filter((i) => i.id).map((i) => ({ ...i, id: i.id! })),
    withMonth.filter((t) => (t.total_installments ?? 0) > 1),
  );

  // assinaturas no cartão: média dos 2 últimos débitos, projetada nos meses de fatura sem cobrança real
  const subs = new Map<string, { account_id: string; key: string; charges: { month: string; cents: number; on: string; desc: string }[] }>();
  for (const t of withMonth) {
    if (t.bucket !== "assinatura" || t.occurred_on > today) continue;
    const key = `${t.account_id}|${subscriptionKey(t.description, t.auto_reason)}`;
    const s = subs.get(key) ?? { account_id: t.account_id!, key, charges: [] };
    s.charges.push({ month: t.invoice_month, cents: t.amount_cents, on: t.occurred_on, desc: t.description });
    subs.set(key, s);
  }
  const subscriptions = [...subs.values()].map((s) => {
    const last2 = [...s.charges].sort((a, b) => b.on.localeCompare(a.on)).slice(0, 2);
    return {
      account_id: s.account_id,
      key: s.key,
      name: last2[0].desc,
      avg_cents: Math.round(last2.reduce((x, c) => x + c.cents, 0) / last2.length),
      lastMonth: s.charges.reduce((m, c) => (c.month > m ? c.month : m), s.charges[0].month),
    };
  });

  return { linked, withMonth, virtual, covered, subscriptions };
}

export type PreparedInvoices = ReturnType<typeof prepareInvoices>;

/**
 * Fatura de cada cartão num mês de vencimento.
 * - Cartão LIGADO ao banco: compras reais daquele mês de fatura + parcelas futuras (do banco ou calculadas)
 *   + assinaturas projetadas. Fatura já fechada no banco: marcada como real (total = compras ligadas a ela;
 *   se não houver compra ligada, o total que a Pluggy informar).
 * - Existe algum cartão ligado: SÓ o real conta. Cartões cadastrados ainda não ligados viram ALERTA
 *   (`unlinkedSeedCards`), nunca estimativa + real somadas.
 * - Nenhum cartão ligado (modo plano): estimativa (parcelas antigas dos fixos + parcelas do plano + crédito).
 * - Reserva do teto: o que falta gastar do teto no crédito do mês anterior, só enquanto aquele mês não acabou.
 */
export function invoicesForMonth(
  p: InvoiceParams,
  prepared?: PreparedInvoices,
): { cards: CardInvoice[]; total: number; unlinkedSeedCards: string[]; seedNotFound: string[] } {
  const prep = prepared ?? prepareInvoices(p);
  const prev = addMonths(p.month, -1);
  const bankMode = p.cards.some(isLinked);
  const byKey = new Map<string | null, CardInvoice>();
  const card = (id: string | null) => {
    if (!byKey.has(id)) {
      const c = id ? p.cards.find((x) => x.id === id) : null;
      byKey.set(id, { accountId: id, name: c?.name ?? "Cartão não informado", total: 0, lines: [], fromBank: c ? isLinked(c) : false });
    }
    return byKey.get(id)!;
  };
  const add = (id: string | null, label: string, cents: number, item?: Omit<InvoiceItem, "cents">) => {
    if (!cents) return;
    const inv = card(id && p.cards.some((c) => c.id === id) ? id : null);
    let line = inv.lines.find((l) => l.label === label);
    if (line) line.cents += cents;
    else inv.lines.push((line = { label, cents, items: [] }));
    if (item) (line.items ??= []).push({ ...item, cents });
    inv.total += cents;
  };
  const nOf = (n?: number | null, total?: number | null) => (total && total > 1 ? `${n ?? "?"}/${total}` : null);

  // --- cartões ligados ao banco: dado real ---
  for (const c of p.cards.filter(isLinked)) {
    const bills = (p.realBills ?? []).filter((b) => b.account_id === c.id && b.due_date.startsWith(p.month.slice(0, 7)));
    const rows = prep.withMonth.filter((t) => t.account_id === c.id && t.invoice_month === p.month);
    for (const t of rows)
      add(c.id, (t.total_installments ?? 0) > 1 ? "Parcelas" : "Compras", t.amount_cents, {
        id: t.id,
        date: t.occurred_on,
        description: t.description,
        installment: nOf(t.installment_number, t.total_installments),
        origin: "banco",
      });
    for (const v of prep.virtual) {
      if (v.account_id === c.id && v.invoice_month === p.month)
        add(c.id, "Parcelas (calculadas)", v.amount_cents, {
          id: null,
          date: null,
          description: v.description,
          installment: nOf(v.installment_number, v.total_installments),
          origin: "calculada",
        });
    }
    for (const s of prep.subscriptions) {
      if (s.account_id === c.id && p.month > s.lastMonth)
        add(c.id, "Assinaturas (projetadas)", s.avg_cents, { id: null, date: null, description: s.name, installment: null, origin: "projetada" });
    }
    if (bills.length) {
      const inv = card(c.id);
      inv.real = true;
      if (!rows.length) {
        // nenhuma compra ligada a essa fatura: usa o que a Pluggy informou
        const total = bills.reduce((s, b) => s + b.total_cents, 0);
        inv.lines = [
          {
            label: "Fatura fechada (valor informado pelo banco)",
            cents: total,
            items: [{ id: null, date: bills[0].due_date, description: "Total informado pelo banco", cents: total, installment: null, origin: "banco" }],
          },
        ];
        inv.total = total;
      }
    }
  }

  // --- cartões não ligados ---
  const unlinked = p.cards.filter((c) => !isLinked(c));
  const unlinkedSeedCards: string[] = [];
  const seedNotFound: string[] = [];
  if (!bankMode) {
    for (const f of p.fixed) {
      if (f.month === p.month && f.category === "cartao") add(f.account_id, "Parcelas antigas (estimativa)", f.amount_cents);
    }
  } else {
    for (const c of unlinked) {
      if (p.fixed.some((f) => f.month === p.month && f.category === "cartao" && f.account_id === c.id && f.amount_cents > 0)) unlinkedSeedCards.push(c.name);
    }
  }
  for (const i of p.installments) {
    if (i.status === "planejada" && !p.includePlanned) continue;
    if (i.status === "quitada") continue;
    if (i.id && prep.covered.has(i.id)) continue; // já está nas compras reais do banco
    const cents = installmentAmountInMonth(i, p.month);
    if (!cents) continue;
    if (bankMode) {
      // parcela do plano ainda sem par no banco: continua contando até casar com a parcela real,
      // no cartão informado ou numa linha própria "cartão a confirmar"
      if (i.status !== "planejada") seedNotFound.push(i.name);
      const target = i.account_id && p.cards.some((c) => c.id === i.account_id) ? i.account_id : "plano";
      if (target === "plano" && !byKey.has("plano")) {
        byKey.set("plano", { accountId: "plano", name: "Parcelas do plano (cartão a confirmar)", total: 0, lines: [], estimate: true });
      }
      const inv = byKey.get(target) ?? card(target);
      const label = `Parcelas do plano — ${i.name}`;
      const k = monthsBetween(i.first_invoice_month, p.month) + 1;
      const item: InvoiceItem = { id: null, date: null, description: i.name, cents, installment: `${k}/${i.installments_count}`, origin: "plano" };
      const line = inv.lines.find((l) => l.label === label);
      if (line) {
        line.cents += cents;
        (line.items ??= []).push(item);
      } else inv.lines.push({ label, cents, items: [item] });
      inv.total += cents;
      continue;
    }
    add(i.account_id, i.name, cents);
  }
  let creditSpent = 0;
  const prevBudget = p.budgets.find((b) => b.month === prev);
  for (const t of p.transactions) {
    if (t.method !== "credito") continue;
    if (!countsInDaily(t, { month: prev, controlStart: prevBudget?.control_start ?? null, today: p.today })) continue;
    // lançamento manual sem cartão não vira fatura: fica coberto pela reserva do teto
    if (!t.account_id && t.source === "manual") continue;
    creditSpent += t.amount_cents;
    if (bankMode) continue; // banco: já entrou pelas compras reais
    add(t.account_id, "Gastos do dia a dia já lançados", t.amount_cents);
  }

  // --- reserva do teto (estimativa do que ainda vai ser gasto no crédito) ---
  const prevOver = p.today ? p.today > lastDayOfMonth(prev) : false;
  const reserved = prevOver ? 0 : dailySplit(p.budgets, p.transactions, prev, p.today).credit - creditSpent;
  if (reserved > 0) {
    byKey.set("reserva", {
      accountId: "reserva",
      name: "Reserva do teto (estimativa)",
      total: reserved,
      estimate: true,
      lines: [
        {
          label: "Teto do dia a dia no crédito menos o já gasto; some quando o mês fechar",
          cents: reserved,
          items: [{ id: null, date: null, description: "Reserva do teto do dia a dia no crédito", cents: reserved, installment: null, origin: "estimativa" }],
        },
      ],
    });
  }

  const cards = [...byKey.values()].filter((c) => c.total > 0);
  return {
    cards,
    total: cards.reduce((s, c) => s + c.total, 0),
    unlinkedSeedCards,
    /** parcelas do plano ainda sem par no banco (entram como estimativa até casar) */
    seedNotFound: [...new Set(seedNotFound)],
  };
}

/** Soma das linhas de parcelas (reais, calculadas e estimadas) de um mês — mesma fonte das faturas. */
export function installmentsFromInvoices(inv: { cards: CardInvoice[] }): number {
  return inv.cards.reduce((s, c) => s + c.lines.filter((l) => l.label.startsWith("Parcelas")).reduce((x, l) => x + l.cents, 0), 0);
}
