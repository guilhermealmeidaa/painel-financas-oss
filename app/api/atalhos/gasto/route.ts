import { loadAllFor } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { METHOD_LABEL, bucketLabels } from "@/lib/labels";
import { authenticate, withinRateLimit } from "@/lib/mcp-auth";
import { buildGasto, remainingFor, type Meio } from "@/lib/mcp/write";
import { originOf } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { atalhoReply, bearerOf, brl, parseCategoria, parseValor } from "@/lib/atalhos";

/**
 * Atalho do iPhone "Lançar gasto": POST JSON { valor, descricao, categoria?, meio?, chave? } com
 * `Authorization: Bearer pf_…` de um token que pode lançar gastos. Mesma regra do lancar_gasto do MCP:
 * só CRIA um gasto manual (hoje), nunca edita nem apaga; responde o novo "ainda posso gastar".
 */
export async function POST(req: Request) {
  const caller = await authenticate(bearerOf(req), originOf(req));
  if (!caller) return atalhoReply(req, 401, "Token inválido. Gere um em Acesso do Claude.");
  if (!caller.scopes.includes("write")) return atalhoReply(req, 403, "Este token é só leitura. Gere um com 'Permitir lançar gastos'.");
  if (!(await withinRateLimit(caller))) return atalhoReply(req, 429, "Muitas chamadas. Tente de novo em um minuto.");

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const cents = parseValor(body.valor);
  if (!cents || cents <= 0) return atalhoReply(req, 400, "Não entendi o valor. Diga só o número, por exemplo 30,50.");
  const meio = typeof body.meio === "string" && ["credito", "debito", "pix"].includes(body.meio) ? (body.meio as Meio) : undefined;

  const admin = createAdminClient()!;
  const d = await loadAllFor(admin, caller.userId);
  const today = todayISO();
  const chave = typeof body.chave === "string" && body.chave.trim().length >= 8 ? body.chave.trim().slice(0, 100) : undefined;
  if (chave) {
    const { data: prev } = await admin.from("transactions").select("id").eq("user_id", caller.userId).eq("idempotency_key", chave).maybeSingle();
    if (prev) return atalhoReply(req, 200, "Esse gasto já tinha sido lançado.");
  }
  const built = buildGasto(
    d,
    { valor: cents / 100, descricao: String(body.descricao ?? "Gasto"), bucket: parseCategoria(body.categoria, d.settings) ?? undefined, meio, chave },
    today,
    () => null,
  );
  if ("erro" in built) return atalhoReply(req, 400, built.erro);

  const { error } = await admin.from("transactions").insert({ ...built.row, user_id: caller.userId, source: "manual" });
  if (error) return atalhoReply(req, error.code === "23505" ? 200 : 500, error.code === "23505" ? "Esse gasto já tinha sido lançado." : "Não consegui salvar. Tente de novo.");

  console.info(JSON.stringify({ evt: "atalho_gasto", bucket: built.row.bucket }));
  const after = remainingFor(await loadAllFor(admin, caller.userId), today, today);
  const what = `${brl(built.row.amount_cents)} de ${built.row.description} (${bucketLabels(d.settings)[built.row.bucket].toLowerCase()}, ${METHOD_LABEL[built.row.method].toLowerCase()})`;
  const daily = built.row.bucket === "lazer" || built.row.bucket === "mercado";
  const tail = after && daily ? (after.cents >= 0 ? ` Ainda dá para gastar ${brl(after.cents)} no mês.` : ` Passou ${brl(-after.cents)} do teto do mês.`) : "";
  return atalhoReply(req, 201, `Lançado: ${what}.${tail}`, { ainda_posso_gastar: after ? after.cents / 100 : null });
}
