import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { addDays, todayISO } from "@/lib/dates";
import { getItem, listAccounts, listBills, listTransactions, PluggyError } from "./client";
import { findAccountByName, mapTransaction, matchManual, pluggyDate, toCents, type MappedTx } from "./map";
import { applyRulesFor } from "@/lib/rules";
import { mergeManual } from "@/lib/merge-writer";
import { syncCardsFor } from "@/lib/cards-writer";

type DB = SupabaseClient<Database>;

/** Quantos dias para trás buscar a cada sync. A Meu Pluggy atualiza 1x/dia; 90 dias cobre faturas e parcelas. */
const WINDOW_DAYS = 90;

export interface ItemSummary {
  itemId: string;
  connector: string | null;
  status: string | null;
  accounts: number;
  bills: number;
  inserted: number;
  updated: number;
  linkedManual: number;
  error?: string;
}

/**
 * Sincroniza todos os items de um usuário. Idempotente: pode rodar quantas vezes quiser.
 * Funciona com o cliente do usuário (RLS) ou com service role no cron (passando userId).
 */
export async function syncUser(db: DB, userId: string): Promise<ItemSummary[]> {
  const { data: items, error } = await db.from("pluggy_items").select("id, item_id").eq("user_id", userId);
  if (error) throw new Error("Falha ao ler items");
  const out: ItemSummary[] = [];
  for (const it of items ?? []) {
    const summary = await syncItem(db, userId, it.item_id).catch(
      (e: unknown): ItemSummary => ({
        itemId: it.item_id,
        connector: null,
        status: null,
        accounts: 0,
        bills: 0,
        inserted: 0,
        updated: 0,
        linkedManual: 0,
        error: e instanceof PluggyError ? e.message : "Erro inesperado no sync",
      }),
    );
    await db
      .from("pluggy_items")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_summary: summary as unknown as Json,
        ...(summary.status ? { status: summary.status } : {}),
      })
      .eq("id", it.id);
    out.push(summary);
  }
  // Depois de tudo gravado: junta lançamentos manuais com os do banco e classifica o óbvio.
  const merged = await reconcileManual(db, userId);
  if (out[0]) out[0].linkedManual += merged;
  await applyRulesFor(db, userId);
  // cartões: dias, faturas pagas, fixos pagos, compras do plano cobertas
  await syncCardsFor(db, userId).catch(() => null);
  return out;
}

/**
 * Junta sozinho os lançamentos manuais que têm UM par claro no banco (mesmo tipo, até 3 dias,
 * valor parecido; ver matchScore). Não apaga nada: o manual fica "substituído" e a transação do
 * banco herda o bucket dele. Casos de 1 manual × várias compras viram sugestão na Triagem.
 */
export async function reconcileManual(db: DB, userId: string): Promise<number> {
  const since = addDays(todayISO(), -WINDOW_DAYS);
  const [{ data: manual }, { data: bank }] = await Promise.all([
    db
      .from("transactions")
      .select("id, occurred_on, amount_cents, method, description, bucket")
      .eq("user_id", userId)
      .eq("source", "manual")
      .is("external_id", null)
      .eq("superseded", false)
      .gte("occurred_on", since),
    db
      .from("transactions")
      .select("id, occurred_on, amount_cents, method, description")
      .eq("user_id", userId)
      .eq("source", "pluggy")
      .is("manual_id", null)
      .eq("user_locked", false)
      // inclui o que já foi classificado por regra/categoria, senão o manual fica duplicado
      .in("bucket", ["sem_categoria", "lazer", "mercado"])
      .eq("is_inflow", false)
      .gte("occurred_on", addDays(since, -3)),
  ]);
  let n = 0;
  for (const [manualId, bankId] of matchManual(manual ?? [], bank ?? [])) {
    try {
      await mergeManual(db, userId, manualId, [bankId]);
      n++;
    } catch {
      // par mudou no meio do caminho: fica para a Triagem
    }
  }
  return n;
}

async function syncItem(db: DB, userId: string, itemId: string): Promise<ItemSummary> {
  const item = await getItem(itemId);
  await db
    .from("pluggy_items")
    .update({
      status: item.status,
      connector_name: item.connector?.name ?? null,
      consent_expires_at: item.consentExpiresAt ?? null,
    })
    .eq("user_id", userId)
    .eq("item_id", itemId);

  const summary: ItemSummary = {
    itemId,
    connector: item.connector?.name ?? null,
    status: item.status,
    accounts: 0,
    bills: 0,
    inserted: 0,
    updated: 0,
    linkedManual: 0,
  };

  const [{ data: local }, { data: rules }, { data: settings }] = await Promise.all([
    db.from("accounts").select("id, name, kind, pluggy_account_id").eq("user_id", userId),
    db.from("categorization_rules").select("pattern, bucket").eq("user_id", userId),
    db.from("settings").select("projection_start").eq("user_id", userId).maybeSingle(),
  ]);
  // Gastos anteriores ao início do plano não vão para a triagem.
  const planStart = settings?.projection_start ?? "0000-01-01";
  const localAccounts = local ?? [];

  const pluggyAccounts = await listAccounts(itemId);
  const dateFrom = addDays(todayISO(), -WINDOW_DAYS);

  for (const acc of pluggyAccounts) {
    const isCard = acc.type === "CREDIT";
    // 1) conta local: já vinculada > mesmo nome (cartões do seed) > nova
    let target = localAccounts.find((a) => a.pluggy_account_id === acc.id);
    if (!target && isCard) {
      target = findAccountByName(
        localAccounts.filter((a) => a.kind === "credit_card" && !a.pluggy_account_id),
        acc.marketingName,
        acc.name,
        item.connector?.name,
      );
    }
    const fields = {
      pluggy_account_id: acc.id,
      // nome como a Pluggy manda (ex.: "GOLD", "PLATINUM"): apelido para buscas, mesmo depois de renomear
      pluggy_name: (acc.marketingName || acc.name || "").trim().slice(0, 80) || null,
      pluggy_item_id: itemId,
      balance_cents: Math.round(acc.balance * 100),
      credit_limit_cents: acc.creditData?.creditLimit != null ? toCents(acc.creditData.creditLimit) : null,
      available_limit_cents: acc.creditData?.availableCreditLimit != null ? toCents(acc.creditData.availableCreditLimit) : null,
      bill_close_date: acc.creditData?.balanceCloseDate ? pluggyDate(acc.creditData.balanceCloseDate) : null,
      bill_due_date: acc.creditData?.balanceDueDate ? pluggyDate(acc.creditData.balanceDueDate) : null,
      synced_at: new Date().toISOString(),
    };
    let accountId: string;
    if (target) {
      await db.from("accounts").update(fields).eq("id", target.id);
      accountId = target.id;
      target.pluggy_account_id = acc.id;
    } else {
      const baseName = (acc.marketingName || acc.name || "Cartão").trim().slice(0, 60);
      const name = isCard ? baseName : `Conta ${acc.marketingName || acc.name || ""}`.trim();
      const { data: created, error } = await db
        .from("accounts")
        .insert({ user_id: userId, name: uniqueName(name, localAccounts), kind: isCard ? "credit_card" : "checking", ...fields })
        .select("id, name, kind, pluggy_account_id")
        .single();
      if (error || !created) throw new PluggyError("Falha ao salvar conta", 500);
      localAccounts.push(created);
      accountId = created.id;
    }
    summary.accounts++;

    // 2) faturas reais do cartão
    if (isCard) {
      const bills = await listBills(acc.id).catch(() => []);
      if (bills.length) {
        const { error } = await db.from("card_bills").upsert(
          bills.map((b) => ({
            user_id: userId,
            account_id: accountId,
            pluggy_bill_id: b.id,
            due_date: pluggyDate(b.dueDate),
            closing_date: b.billClosingDate ? pluggyDate(b.billClosingDate) : null,
            total_cents: toCents(b.totalAmount),
            minimum_cents: b.minimumPaymentAmount != null ? toCents(b.minimumPaymentAmount) : null,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,pluggy_bill_id" },
        );
        if (!error) summary.bills += bills.length;
      }
    }

    // 3) transações
    const txs = await listTransactions(acc.id, dateFrom);
    const mapped: MappedTx[] = txs
      .map((t) => mapTransaction(t, { id: accountId, isCard }, rules ?? []))
      .map((m) => (m.bucket === "sem_categoria" && m.occurred_on < planStart ? { ...m, bucket: "ignorar" as const } : m));
    if (!mapped.length) continue;

    for (let i = 0; i < mapped.length; i += 200) {
      const chunk = mapped.slice(i, i + 200).map((m) => ({ ...m, user_id: userId }));
      const { data, error } = await db.rpc("upsert_pluggy_transactions", { rows: chunk as unknown as Json });
      if (error) throw new PluggyError("Falha ao salvar transações", 500);
      summary.inserted += data?.[0]?.inserted ?? 0;
      summary.updated += data?.[0]?.updated ?? 0;
    }
  }
  return summary;
}

function uniqueName(name: string, existing: { name: string }[]) {
  let n = name;
  for (let i = 2; existing.some((e) => e.name === n); i++) n = `${name} ${i}`;
  return n;
}
