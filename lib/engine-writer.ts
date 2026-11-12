import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { addDays } from "@/lib/dates";
import { detectIncomes, runEngine, type EngineRule, type EngineTx } from "@/lib/engine";
import type { Bucket } from "@/lib/projection";

type DB = SupabaseClient<Database>;

export interface EngineSummary {
  decisions: number;
  applied: number;
  incomes: number;
}

/**
 * Roda o motor sobre as transações do usuário (desde 1 semana antes do início do plano)
 * e grava as decisões. Idempotente: rodar de novo não muda o que já está certo.
 */
export async function runEngineFor(db: DB, userId: string): Promise<EngineSummary> {
  const { data: settings } = await db
    .from("settings")
    .select("projection_start, self_names, self_tax_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const firstMonth = settings?.projection_start ?? "2000-01-01";
  const since = addDays(firstMonth, -7);

  const [{ data: rows }, { data: accounts }, { data: rules }, { data: plannedSalary }] = await Promise.all([
    db
      .from("transactions")
      .select(
        "id, occurred_on, description, amount_cents, is_inflow, method, bucket, account_id, pluggy_category, source, user_locked, superseded, auto_reason",
      )
      .eq("user_id", userId)
      .gte("occurred_on", since)
      .limit(20000),
    db.from("accounts").select("id, kind").eq("user_id", userId),
    db.from("categorization_rules").select("pattern, bucket, subtype, origin").eq("user_id", userId),
    db.from("incomes").select("amount_cents").eq("user_id", userId).eq("kind", "salario").eq("source", "manual").limit(1),
  ]);
  const kind = new Map((accounts ?? []).map((a) => [a.id, a.kind]));
  const txs: EngineTx[] = (rows ?? []).map((t) => ({
    ...t,
    bucket: t.bucket as Bucket,
    account_kind: t.account_id ? (kind.get(t.account_id) ?? null) : null,
  }));
  const self = { names: settings?.self_names ?? [], taxIds: settings?.self_tax_ids ?? [] };

  const decisions = runEngine({ txs, rules: (rules ?? []) as EngineRule[], self });
  const payload = [...decisions.entries()].map(([id, d]) => ({
    id,
    bucket: d.bucket,
    auto_reason: d.auto_reason,
    linked_tx_id: d.linked_tx_id ?? null,
    fee_cents: d.fee_cents ?? null,
    subtype: d.subtype ?? null,
  }));
  let applied = 0;
  for (let i = 0; i < payload.length; i += 300) {
    const { data, error } = await db.rpc("apply_auto_decisions", { rows: payload.slice(i, i + 300) as unknown as Json });
    if (error) throw new Error(`Falha ao aplicar decisões: ${error.message}`);
    applied += data ?? 0;
  }

  // Entradas do banco
  const incomes = detectIncomes(txs, {
    self,
    plannedSalaryCents: plannedSalary?.[0]?.amount_cents ?? 0,
    firstMonth,
  });
  let incomesWritten = 0;
  if (incomes.length) {
    const { data: existing } = await db
      .from("incomes")
      .select("transaction_id, status")
      .eq("user_id", userId)
      .not("transaction_id", "is", null);
    const known = new Set((existing ?? []).map((e) => e.transaction_id));
    const fresh = incomes.filter((i) => !known.has(i.transaction_id));
    if (fresh.length) {
      const { error } = await db.from("incomes").insert(
        fresh.map((i) => ({
          user_id: userId,
          month: i.month,
          description: i.description,
          kind: i.kind,
          amount_cents: i.amount_cents,
          source: "banco",
          status: "auto",
          transaction_id: i.transaction_id,
        })),
      );
      if (!error) incomesWritten = fresh.length;
    }
    // salário real do banco substitui o salário planejado do mesmo mês (não apaga: marca "substituida")
    const salaryMonths = [...new Set(incomes.filter((i) => i.kind === "salario").map((i) => i.month))];
    if (salaryMonths.length) {
      await db
        .from("incomes")
        .update({ status: "substituida" })
        .eq("user_id", userId)
        .eq("source", "manual")
        .eq("kind", "salario")
        .eq("status", "confirmada")
        .in("month", salaryMonths);
    }
  }
  return { decisions: decisions.size, applied, incomes: incomesWritten };
}
