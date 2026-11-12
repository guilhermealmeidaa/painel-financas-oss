import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/database.types";

const BUCKETS: Enums<"bucket">[] = ["lazer", "mercado", "fixo", "assinatura", "parcela", "ignorar", "sem_categoria"];
const METHODS: Enums<"payment_method">[] = ["credito", "debito", "pix"];

/** Lança um gasto manual. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount_cents);
  const description = String(body?.description ?? "").trim().slice(0, 120);
  const occurredOn = String(body?.occurred_on ?? "");
  const bucket = body?.bucket as Enums<"bucket">;
  const method = body?.method as Enums<"payment_method">;
  const accountId = body?.account_id ? String(body.account_id) : null;

  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
  }
  if (!description) return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }
  if (!BUCKETS.includes(bucket) || !METHODS.includes(method)) {
    return NextResponse.json({ error: "Bucket ou meio inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({ amount_cents: amount, description, occurred_on: occurredOn, bucket, method, account_id: accountId, source: "manual" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
