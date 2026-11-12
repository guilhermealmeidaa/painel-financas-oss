import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { runEngineFor } from "@/lib/engine-writer";

type DB = SupabaseClient<Database>;

/** Reaplica o motor (regras + Pix no crédito + pagamentos + IOF + entradas). Retorna quantas mudaram. */
export async function applyRulesFor(db: DB, userId: string): Promise<number> {
  const r = await runEngineFor(db, userId);
  return r.applied;
}

/** Versão para rotas com sessão (RLS). */
export async function applyRules(db: DB): Promise<number> {
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? applyRulesFor(db, userId) : 0;
}
