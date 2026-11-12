import { NextResponse } from "next/server";
import { applyRules } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";

const BUCKETS = ["lazer", "mercado", "fixo", "assinatura", "parcela", "ignorar"] as const;

/** Cria uma regra "descrição contém X -> bucket" e já aplica nas transações sem categoria. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pattern = String(body?.pattern ?? "").trim().slice(0, 60);
  const bucket = body?.bucket as (typeof BUCKETS)[number];
  if (pattern.length < 2) return NextResponse.json({ error: "Padrão muito curto" }, { status: 400 });
  if (!BUCKETS.includes(bucket)) return NextResponse.json({ error: "Bucket inválido" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("categorization_rules").upsert({ pattern, bucket }, { onConflict: "user_id,pattern" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar a regra" }, { status: 500 });
  const applied = await applyRules(supabase);
  return NextResponse.json({ applied }, { status: 201 });
}
