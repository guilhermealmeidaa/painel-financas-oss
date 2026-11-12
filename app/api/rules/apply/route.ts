import { NextResponse } from "next/server";
import { applyRules } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";

/** Reaplica todas as regras nas transações sem categoria. */
export async function POST() {
  const supabase = await createClient();
  const applied = await applyRules(supabase);
  return NextResponse.json({ applied });
}
