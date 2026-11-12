import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

/**
 * Junta 1 lançamento manual com N transações do banco, SEM apagar nada:
 * - as do banco ficam com o bucket do manual, manual_id apontando para ele e motivo "juntado_manual";
 * - o manual fica "substituído" (não conta mais em nada), e pode ser restaurado com unmerge.
 */
export async function mergeManual(db: DB, userId: string, manualId: string, bankIds: string[]) {
  const [{ data: manual }, { data: bank }] = await Promise.all([
    db.from("transactions").select("id, bucket, source, external_id, superseded").eq("id", manualId).eq("user_id", userId).maybeSingle(),
    db.from("transactions").select("id, bucket, source, manual_id, auto_reason").in("id", bankIds).eq("user_id", userId),
  ]);
  if (!manual || manual.source !== "manual" || manual.external_id || manual.superseded) throw new Error("Lançamento manual inválido");
  if (!bank || bank.length !== bankIds.length || bank.some((b) => b.source !== "pluggy" || b.manual_id)) {
    throw new Error("Transação do banco inválida ou já juntada");
  }
  for (const b of bank) {
    const { error } = await db
      .from("transactions")
      .update({
        bucket: manual.bucket,
        manual_id: manual.id,
        auto_reason: "juntado_manual",
        // guarda o bucket de antes só se ainda não havia uma decisão automática registrada
        ...(b.auto_reason ? {} : { prev_bucket: b.bucket }),
      })
      .eq("id", b.id);
    if (error) throw new Error("Falha ao juntar");
  }
  const { error } = await db.from("transactions").update({ superseded: true }).eq("id", manual.id);
  if (error) throw new Error("Falha ao marcar o manual");
}

/** Desfaz: o manual volta a contar e as transações do banco voltam ao bucket anterior. */
export async function unmergeManual(db: DB, userId: string, manualId: string) {
  const { data: bank } = await db.from("transactions").select("id, prev_bucket").eq("manual_id", manualId).eq("user_id", userId);
  for (const b of bank ?? []) {
    await db
      .from("transactions")
      .update({ manual_id: null, auto_reason: null, bucket: b.prev_bucket ?? "sem_categoria", user_locked: true })
      .eq("id", b.id);
  }
  await db.from("transactions").update({ superseded: false }).eq("id", manualId).eq("user_id", userId);
}
