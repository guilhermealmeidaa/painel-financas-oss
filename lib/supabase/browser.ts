import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/** Usado só na tela de login. Dados financeiros passam pelos Route Handlers. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
