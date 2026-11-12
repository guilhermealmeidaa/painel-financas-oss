/**
 * Regras de cartão (puras): dias de fechamento/vencimento, mês de fatura de cada compra,
 * parcelas futuras, fatura paga e compras do plano já cobertas pelo banco.
 */
import { addDays, addMonths, monthOf, monthsBetween } from "./dates";

const dom = (iso: string) => Number(iso.slice(8, 10));

function mode(nums: number[]): number | null {
  if (!nums.length) return null;
  const c = new Map<number, number>();
  for (const n of nums) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Dia de fechamento e de vencimento mais comuns nas últimas faturas do banco. */
export function inferCardDays(bills: { closing_date: string | null; due_date: string }[]): { closing_day: number | null; due_day: number | null } {
  const recent = [...bills].sort((a, b) => b.due_date.localeCompare(a.due_date)).slice(0, 6);
  return {
    closing_day: mode(recent.filter((b) => b.closing_date).map((b) => dom(b.closing_date!))),
    due_day: mode(recent.map((b) => dom(b.due_date))),
  };
}

/** Data com o dia limitado ao fim do mês (dia 31 em fevereiro vira 28/29). */
function dateIn(month: string, day: number): string {
  const last = dom(addDays(addMonths(month, 1), -1));
  return `${month.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
}

/**
 * Mês de vencimento da fatura em que cai uma compra feita em `date`.
 * Compra até o dia do fechamento entra na fatura que fecha naquele mês; depois disso, na do mês seguinte.
 * O vencimento é o primeiro `dueDay` depois do fechamento. Sem os dias: fatura do mês seguinte.
 */
export function invoiceMonth(date: string, closingDay: number | null, dueDay: number | null): string {
  const m = monthOf(date);
  if (!closingDay || !dueDay) return addMonths(m, 1);
  const closeMonth = dom(date) <= closingDay ? m : addMonths(m, 1);
  const closing = dateIn(closeMonth, closingDay);
  const dueSame = dateIn(closeMonth, dueDay);
  return dueSame > closing ? closeMonth : addMonths(closeMonth, 1);
}

export interface CardTx {
  id: string;
  account_id: string | null;
  occurred_on: string;
  description: string;
  amount_cents: number;
  installment_number: number | null;
  total_installments: number | null;
  pluggy_bill_id: string | null;
}

/** Mês de fatura de uma transação de cartão: pela fatura do banco (bill id) se houver, senão pelos dias. */
export function txInvoiceMonth(
  t: CardTx,
  days: { closing_day: number | null; due_day: number | null } | undefined,
  billDueMonth: Map<string, string>,
): string {
  if (t.pluggy_bill_id && billDueMonth.has(t.pluggy_bill_id)) return billDueMonth.get(t.pluggy_bill_id)!;
  return invoiceMonth(t.occurred_on, days?.closing_day ?? null, days?.due_day ?? null);
}

/**
 * Chave da compra parcelada: mesmo cartão, descrição sem o "n/total", mesmo total de parcelas e
 * mesmo MÊS DE ORIGEM (mês da parcela − (n − 1)). Não usa o valor: no Pix parcelado de alguns bancos a
 * parcela muda todo mês por causa dos juros ("FARMACIA 3/8" 24,24 → "4/8" 26,91 → "5/8" 29,86
 * é UMA compra só). O mês de origem separa duas compras iguais feitas em meses diferentes.
 */
export function purchaseKey(t: CardTx): string | null {
  if (!t.account_id || !t.total_installments || t.total_installments < 2 || !t.installment_number) return null;
  const base = t.description
    .replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const origin = addMonths(monthOf(t.occurred_on), 1 - t.installment_number);
  return `${t.account_id}|${base}|${t.total_installments}|${origin}`;
}

/**
 * Agrupa as parcelas por compra. Mesma chave base (cartão + descrição + nº de parcelas) e mês de
 * origem a até 1 mês de distância, sem repetir o número da parcela. A tolerância cobre bancos que
 * lançam a parcela 1 na data da compra e as seguintes na data da fatura (Santander: 1@15/08, 2@31/08,
 * 3@28/09…), em que o mês de origem calculado oscila em 1.
 */
export function groupPurchases<T extends CardTx>(rows: T[]): T[][] {
  const byBase = new Map<string, T[]>();
  for (const t of rows) {
    const k = purchaseKey(t);
    if (!k) continue;
    const base = k.slice(0, k.lastIndexOf("|"));
    byBase.set(base, [...(byBase.get(base) ?? []), t]);
  }
  const out: T[][] = [];
  const originOf = (t: T) => monthsBetween("2000-01-01", addMonths(monthOf(t.occurred_on), 1 - t.installment_number!));
  for (const list of byBase.values()) {
    // Antecipação: o banco lança de uma vez, no mesmo dia, as parcelas restantes até a última
    // (AMAZON 2/10…10/10 em 16/09). Essas linhas são UMA compra só, e ela já terminou.
    const byDate = new Map<string, T[]>();
    for (const t of list) byDate.set(t.occurred_on, [...(byDate.get(t.occurred_on) ?? []), t]);
    const handled = new Set<T>();
    for (const same of byDate.values()) {
      if (same.length < 3) continue;
      const nums = [...new Set(same.map((t) => t.installment_number!))].sort((a, b) => a - b);
      const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
      if (consecutive && nums.length === same.length && nums.at(-1) === same[0].total_installments) {
        // as parcelas anteriores (1/10 em 10/09) são da mesma compra
        const group = [...same];
        const day = same[0].occurred_on;
        for (let k = nums[0] - 1; k >= 1; k--) {
          const prev = list
            .filter((t) => t.installment_number === k && !handled.has(t) && !group.includes(t) && t.occurred_on <= day)
            // valor mais parecido primeiro (1/10 de 7,06, não a outra compra de 70,24), depois a mais recente
            .sort(
              (a, b) =>
                Math.abs(a.amount_cents - same[0].amount_cents) - Math.abs(b.amount_cents - same[0].amount_cents) ||
                b.occurred_on.localeCompare(a.occurred_on),
            )[0];
          if (!prev) break;
          group.push(prev);
        }
        out.push(group);
        group.forEach((t) => handled.add(t));
      }
    }
    const clusters: { origin: number; rows: T[] }[] = [];
    for (const t of [...list].filter((t) => !handled.has(t)).sort((a, b) => a.installment_number! - b.installment_number! || a.occurred_on.localeCompare(b.occurred_on))) {
      const o = originOf(t);
      // uma compra nunca tem duas parcelas no mesmo dia nem dois números iguais
      const c = clusters.find(
        (x) =>
          Math.abs(x.origin - o) <= 1 &&
          !x.rows.some((r) => r.installment_number === t.installment_number || r.occurred_on === t.occurred_on),
      );
      if (c) c.rows.push(t);
      else clusters.push({ origin: o, rows: [t] });
    }
    out.push(...clusters.map((c) => c.rows));
  }
  return out;
}

/**
 * Mês de fatura das parcelas pela SEQUÊNCIA, não pela data: parcela k = mês da âncora + (k − n).
 * O banco às vezes data a parcela n no dia da compra (09/11) e a n+1 no dia padrão (04/12),
 * e as duas caem na mesma janela de fatura; pela sequência, cada parcela fica num mês.
 * Âncora: a parcela ligada a uma fatura do banco (bill id), senão a de menor número.
 */
export function allocateBySequence<T extends CardTx>(
  rows: T[],
  monthByDate: (t: T) => string,
  hasBill: (t: T) => boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const list of groupPurchases(rows)) {
    const billed = list.filter(hasBill).sort((a, b) => a.installment_number! - b.installment_number!);
    const anchor = billed[0] ?? [...list].sort((a, b) => a.installment_number! - b.installment_number!)[0];
    const anchorMonth = monthByDate(anchor);
    // antecipação (3+ parcelas no mesmo dia): todas caem na fatura daquele dia, não em meses seguidos
    const perDate = new Map<string, number>();
    for (const t of list) perDate.set(t.occurred_on, (perDate.get(t.occurred_on) ?? 0) + 1);
    for (const t of list) {
      if ((perDate.get(t.occurred_on) ?? 0) >= 3) out.set(t.id, monthByDate(t));
      else out.set(t.id, addMonths(anchorMonth, t.installment_number! - anchor.installment_number!));
    }
  }
  return out;
}

export interface VirtualInstallment {
  account_id: string;
  description: string;
  amount_cents: number;
  installment_number: number;
  total_installments: number;
  /** mês de fatura (vencimento) */
  invoice_month: string;
}

/**
 * Parcelas que ainda vão cair mas o banco não mandou (alguns bancos não mandam parcelas futuras):
 * para cada compra parcelada, pega a maior parcela já recebida (n/total) e projeta n+1..total
 * nos meses de fatura seguintes. Se o banco já mandou a parcela futura, não duplica.
 */
export function synthesizeInstallments(
  txs: CardTx[],
  monthOfTx: (t: CardTx) => string,
  /** cartões que já mandam parcelas futuras (ex.: Nubank, Mercado Pago): para eles nada é calculado */
  accountsWithFuture: Set<string> = new Set(),
): VirtualInstallment[] {
  const out: VirtualInstallment[] = [];
  for (const list of groupPurchases(txs.filter((t) => !(t.account_id && accountsWithFuture.has(t.account_id))))) {
    const last = list.reduce((a, b) => ((b.installment_number ?? 0) > (a.installment_number ?? 0) ? b : a));
    const n = last.installment_number!;
    const total = last.total_installments!;
    const lastMonth = monthOfTx(last);
    for (let k = n + 1; k <= total; k++) {
      out.push({
        account_id: last.account_id!,
        description: last.description,
        amount_cents: last.amount_cents,
        installment_number: k,
        total_installments: total,
        invoice_month: addMonths(lastMonth, k - n),
      });
    }
  }
  return out;
}

/**
 * Fatura paga: soma dos pagamentos recebidos no cartão entre o fechamento (ou 25 dias antes do
 * vencimento) e 5 dias depois do vencimento cobre o valor (tolerância de R$ 1).
 */
export function billPayment(
  bill: { total_cents: number; due_date: string; closing_date: string | null },
  payments: { id: string; occurred_on: string; amount_cents: number }[],
): { paid: boolean; paid_cents: number; payment_tx_id: string | null; paid_on: string | null } {
  if (bill.total_cents <= 0) return { paid: true, paid_cents: 0, payment_tx_id: null, paid_on: null };
  const from = bill.closing_date ?? addDays(bill.due_date, -25);
  const to = addDays(bill.due_date, 5);
  const inWindow = payments
    .filter((p) => p.occurred_on >= from && p.occurred_on <= to)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const paid_cents = inWindow.reduce((s, p) => s + p.amount_cents, 0);
  const paid = paid_cents >= bill.total_cents - 100;
  const last = inWindow.at(-1);
  return { paid, paid_cents, payment_tx_id: last?.id ?? null, paid_on: paid ? (last?.occurred_on ?? null) : null };
}

/** Data deslocada em N meses, mantendo o dia (limitado ao fim do mês). */
export function shiftDate(iso: string, months: number): string {
  const m = addMonths(monthOf(iso), months);
  return dateIn(m, dom(iso));
}

/**
 * Compras parceladas do plano (videogame, roupas…) que já aparecem no banco.
 * Casa por: mesmo número de parcelas, parcela a ±2% e data da compra a ±3 dias
 * (data da compra do banco = data da parcela n − (n−1) meses). Sem data de compra no plano,
 * cai na regra antiga: 1ª fatura a até 1 mês de distância.
 * Ex.: "Jaqueta" 12× 18,70 (09/11) = "LOJA ONLINE 1/12" 18,78 (09/11);
 *      "MP*MP 2/12" 18,81 (09/11) NÃO casa: é parcela 2, a compra foi em ~09/10.
 */
export function coveredSeedInstallments(
  seed: { id: string; installment_cents: number; installments_count: number; first_invoice_month: string; status: string; purchase_date?: string | null }[],
  bank: (CardTx & { invoice_month: string })[],
): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const dayN = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  for (const s of seed) {
    if (s.status !== "ativa") continue;
    const candidates = bank
      .filter(
        (b) =>
          !used.has(b.id) &&
          b.total_installments === s.installments_count &&
          Math.abs(b.amount_cents - s.installment_cents) <= Math.max(2, s.installment_cents * 0.02),
      )
      .map((b) => {
        const purchase = shiftDate(b.occurred_on, 1 - (b.installment_number ?? 1));
        const days = s.purchase_date ? Math.abs(dayN(purchase) - dayN(s.purchase_date)) : null;
        return { b, days };
      })
      .filter(({ b, days }) =>
        days != null
          ? days <= 3
          : Math.abs(monthsBetween(s.first_invoice_month, addMonths(b.invoice_month, 1 - (b.installment_number ?? 1)))) <= 1,
      )
      .sort((x, y) => (x.days ?? 0) - (y.days ?? 0) || Math.abs(x.b.amount_cents - s.installment_cents) - Math.abs(y.b.amount_cents - s.installment_cents));
    const hit = candidates[0]?.b;
    if (hit) {
      used.add(hit.id);
      out.set(s.id, hit.id);
    }
  }
  return out;
}
