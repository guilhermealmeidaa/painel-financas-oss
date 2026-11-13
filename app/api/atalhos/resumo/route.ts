import { budgetStatus } from "@/lib/budget";
import { loadAllFor } from "@/lib/data";
import { monthOf, todayISO } from "@/lib/dates";
import { authenticate, withinRateLimit } from "@/lib/mcp-auth";
import { originOf } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { atalhoReply, bearerOf, brl, monthName, weekendList } from "@/lib/atalhos";

/**
 * Atalho do iPhone "Quanto posso gastar?": GET com `Authorization: Bearer pf_…`.
 * Responde texto pronto para a Siri falar (ou JSON com ?formato=json). Só leitura.
 */
export async function GET(req: Request) {
  const caller = await authenticate(bearerOf(req), originOf(req));
  if (!caller) return atalhoReply(req, 401, "Token inválido. Gere um em Acesso do Claude.");
  if (!(await withinRateLimit(caller))) return atalhoReply(req, 429, "Muitas chamadas. Tente de novo em um minuto.");
  const admin = createAdminClient()!;
  const d = await loadAllFor(admin, caller.userId);
  const today = todayISO();
  const budget = d.budgets.find((b) => b.month === monthOf(today));
  if (!budget) return atalhoReply(req, 200, "Este mês ainda não tem teto do dia a dia no Planejamento.");
  const st = budgetStatus(budget, d.transactions, today);
  const parts = [
    st.remaining >= 0
      ? `Ainda dá para gastar ${brl(st.remaining)} em ${monthName(today)}.`
      : `Você passou ${brl(-st.remaining)} do teto de ${monthName(today)}.`,
  ];
  if (st.perWeekend && st.weekends.length) {
    parts.push(`${brl(st.perWeekend.total)} por fim de semana (${weekendList(st.weekends)}).`);
  }
  return atalhoReply(req, 200, parts.join(" "), {
    ainda_posso_gastar: st.remaining / 100,
    por_fim_de_semana: st.perWeekend ? st.perWeekend.total / 100 : null,
    fins_de_semana: st.weekends,
  });
}
