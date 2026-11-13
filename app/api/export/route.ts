import { NextResponse } from "next/server";
import { addMonths } from "@/lib/dates";
import { METHOD_LABEL, bucketLabels } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { isMonth } from "@/lib/validate";

/** Campo CSV: entre aspas quando precisa; separador ";" e vírgula decimal (Excel em português abre direto). */
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Transações do mês em CSV (do usuário logado; RLS). Saídas negativas, entradas positivas. */
export async function GET(request: Request) {
  const mes = new URL(request.url).searchParams.get("mes");
  if (!isMonth(mes)) return NextResponse.json({ error: "mes inválido (use AAAA-MM-01)" }, { status: 400 });
  const supabase = await createClient();
  const [{ data: txs, error }, { data: accounts }, { data: settings }] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_on, description, amount_cents, is_inflow, method, bucket, account_id, source, external_id, pluggy_category, installment_number, total_installments, auto_reason")
      .eq("superseded", false)
      .gte("occurred_on", mes)
      .lt("occurred_on", addMonths(mes, 1))
      .order("occurred_on")
      .limit(10000),
    supabase.from("accounts").select("id, name"),
    supabase.from("settings").select("label_lazer, label_mercado").maybeSingle(),
  ]);
  const labels = bucketLabels(settings);
  if (error) return NextResponse.json({ error: "Falha ao ler as transações" }, { status: 500 });
  const names = new Map((accounts ?? []).map((a) => [a.id, a.name.trim()]));
  const header = ["data", "descricao", "valor", "meio", "categoria", "conta", "origem", "categoria_do_banco", "parcela", "decisao_automatica"];
  const lines = (txs ?? []).map((t) =>
    [
      t.occurred_on,
      t.description,
      money(t.is_inflow ? t.amount_cents : -t.amount_cents),
      METHOD_LABEL[t.method],
      labels[t.bucket],
      t.account_id ? (names.get(t.account_id) ?? "") : "",
      t.external_id ? "banco" : "manual",
      t.pluggy_category,
      t.total_installments ? `${t.installment_number ?? "?"}/${t.total_installments}` : "",
      t.auto_reason,
    ]
      .map(cell)
      .join(";"),
  );
  // BOM: o Excel reconhece UTF-8 (acentos)
  const body = "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transacoes-${mes.slice(0, 7)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
