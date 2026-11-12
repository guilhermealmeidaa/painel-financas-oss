import "server-only";
import { createClient } from "./server";

/** Cliente com sessão + id do usuário logado (ou null). Para Route Handlers. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  return { supabase, userId };
}
