import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { billPayment, inferCardDays } from "@/lib/cards";
import { addMonths, monthOf } from "@/lib/dates";
import { invoiceInputs, loadAllFor } from "@/lib/data";
import { prepareInvoices } from "@/lib/invoices";
import { norm } from "@/lib/engine";

type DB = SupabaseClient<Database>;

export interface CardsSummary {
  daysUpdated: number;
  billsPaid: number;
  fixedPaid: number;
  seedCovered: number;
}

/**
 * Depois do sync e do motor:
 * 1. dia de fechamento/vencimento dos cartões pelas faturas do banco (se você não informou);
 * 2. fatura marcada como paga quando há pagamento no cartão que cobre o valor;
 * 3. fixo marcado como pago quando a saída aparece na conta (ex.: nome da distribuidora de energia → luz);
 * 4. compras do plano (videogame, roupas…) que já aparecem no banco ficam "cobertas".
 * Marcações que você desfez (dismissed) não voltam.
 */
export async function syncCardsFor(db: DB, userId: string): Promise<CardsSummary> {
  const sum: CardsSummary = { daysUpdated: 0, billsPaid: 0, fixedPaid: 0, seedCovered: 0 };
  const [{ data: accounts }, { data: bills }, { data: payments }] = await Promise.all([
    db.from("accounts").select("id, kind, closing_day, due_day, days_source, pluggy_account_id").eq("user_id", userId),
    db.from("card_bills").select("id, account_id, due_date, closing_date, total_cents, status, pluggy_bill_id").eq("user_id", userId),
    db.from("bill_payments").select("month, key, dismissed").eq("user_id", userId),
  ]);

  // 1) dias dos cartões
  for (const a of (accounts ?? []).filter((x) => x.kind === "credit_card" && x.days_source !== "usuario")) {
    const inf = inferCardDays((bills ?? []).filter((b) => b.account_id === a.id));
    if (!inf.closing_day && !inf.due_day) continue;
    if (inf.closing_day === a.closing_day && inf.due_day === a.due_day) continue;
    const { error } = await db
      .from("accounts")
      .update({ closing_day: inf.closing_day, due_day: inf.due_day, days_source: "banco" })
      .eq("id", a.id);
    if (!error) sum.daysUpdated++;
  }

  const blocked = new Set((payments ?? []).filter((p) => p.dismissed).map((p) => `${p.month}|${p.key}`));
  const already = new Set((payments ?? []).filter((p) => !p.dismissed).map((p) => `${p.month}|${p.key}`));
  const markPaid = async (month: string, key: string, txId: string | null, reason: string) => {
    const k = `${month}|${key}`;
    if (blocked.has(k) || already.has(k)) return false;
    const { error } = await db
      .from("bill_payments")
      .upsert({ user_id: userId, month, key, transaction_id: txId, auto_reason: reason }, { onConflict: "user_id,month,key", ignoreDuplicates: true });
    if (!error) already.add(k);
    return !error;
  };

  // 2) faturas pagas: pagamentos recebidos no cartão (entradas que o motor marcou como pagamento de fatura)
  const { data: cardPayments } = await db
    .from("transactions")
    .select("id, account_id, occurred_on, amount_cents")
    .eq("user_id", userId)
    .eq("is_inflow", true)
    .eq("auto_reason", "pagamento_fatura");
  // o "total" da Pluggy costuma ser o saldo depois dos pagamentos: o valor da fatura é a soma das compras ligadas a ela
  const { data: linkedTx } = await db
    .from("transactions")
    .select("pluggy_bill_id, amount_cents")
    .eq("user_id", userId)
    .eq("is_inflow", false)
    .not("pluggy_bill_id", "is", null);
  const billSum = new Map<string, number>();
  for (const t of linkedTx ?? []) billSum.set(t.pluggy_bill_id!, (billSum.get(t.pluggy_bill_id!) ?? 0) + t.amount_cents);
  for (const b of bills ?? []) {
    if (b.status === "paga") continue;
    const amount = (b.pluggy_bill_id && billSum.get(b.pluggy_bill_id)) || b.total_cents;
    const prevDue =
      (bills ?? [])
        .filter((x) => x.account_id === b.account_id && x.due_date < b.due_date)
        .map((x) => x.due_date)
        .sort()
        .at(-1) ?? null;
    const res = billPayment({ ...b, total_cents: amount }, (cardPayments ?? []).filter((p) => p.account_id === b.account_id), prevDue);
    if (!res.paid) continue;
    await db
      .from("card_bills")
      .update({ status: "paga", paid_cents: res.paid_cents, paid_on: res.paid_on, payment_tx_id: res.payment_tx_id })
      .eq("id", b.id);
    if (await markPaid(monthOf(b.due_date), `card:${b.account_id}`, res.payment_tx_id, "fatura_paga_banco")) sum.billsPaid++;
  }

  // 3) fixos pagos: saída na conta com o padrão do fixo, no mês do fixo
  const { data: fixed } = await db
    .from("fixed_expenses")
    .select("id, month, match_pattern")
    .eq("user_id", userId)
    .not("match_pattern", "is", null);
  if (fixed?.length) {
    const from = fixed.reduce((m, f) => (f.month < m ? f.month : m), fixed[0].month);
    const { data: outs } = await db
      .from("transactions")
      .select("id, occurred_on, description")
      .eq("user_id", userId)
      .eq("is_inflow", false)
      .neq("method", "credito")
      .gte("occurred_on", from)
      .lt("occurred_on", addMonths(fixed.reduce((m, f) => (f.month > m ? f.month : m), fixed[0].month), 1));
    for (const f of fixed) {
      const pat = norm(f.match_pattern!);
      const hit = (outs ?? []).find((t) => monthOf(t.occurred_on) === f.month && norm(t.description).includes(pat));
      if (hit && (await markPaid(f.month, `fixed:${f.id}`, hit.id, "fixo_pago_banco"))) sum.fixedPaid++;
    }
  }

  // 4) compras do plano cobertas pelo banco (para mostrar na tela de Parcelas)
  const data = await loadAllFor(db, userId);
  const prep = prepareInvoices(invoiceInputs(data));
  for (const s of data.installments) {
    const tx = prep.covered.get(s.id);
    const covered = Boolean(tx);
    if (covered === s.covered_by_bank && (tx ?? null) === s.matched_tx_id) continue;
    await db.from("installment_purchases").update({ covered_by_bank: covered, matched_tx_id: tx ?? null }).eq("id", s.id);
    if (covered) sum.seedCovered++;
  }
  return sum;
}
