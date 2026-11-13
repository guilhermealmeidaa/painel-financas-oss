import { findAnomalies } from "@/lib/anomalies";
import { budgetStatus, dailyTransactions } from "@/lib/budget";
import { bankBalance, type AllData } from "@/lib/data";
import { addDays, monthOf } from "@/lib/dates";
import { subscriptionStats } from "@/lib/mcp/phase2";
import { monthSchedule } from "@/lib/schedule";

import type { AlertKind } from "@/lib/alert-kinds";
export type { AlertKind } from "@/lib/alert-kinds";

export interface Alert {
  kind: AlertKind;
  key: string;
  title: string;
  body: string;
  url: string;
}

export interface SyncItem {
  id: string;
  connector_name: string | null;
  status: string | null;
  last_synced_at: string | null;
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Alertas do momento (sem repetição: a `key` identifica cada um; quem envia guarda o que já foi avisado).
 * Só lê os dados. `nowIso` é o instante atual (para o "sem sync há 30 h").
 */
export function computeAlerts(d: AllData, items: SyncItem[], today: string, nowIso: string, enabled: Partial<Record<AlertKind, boolean>>): Alert[] {
  const on = (k: AlertKind) => enabled[k] !== false;
  const out: Alert[] = [];
  const month = monthOf(today);

  if (on("contas")) {
    const bal = bankBalance(d);
    if (bal) {
      const until = addDays(today, 3);
      const months = [...new Set([month, monthOf(until)])];
      const sched = months.flatMap((m) => monthSchedule(d, m, today)).filter((i) => i.date && i.date >= today && !i.paid);
      // entradas previstas e saídas em ordem; no mesmo dia, a entrada conta primeiro
      sched.sort((a, b) => a.date!.localeCompare(b.date!) || (a.type === "entrada" ? -1 : 1));
      let acc = bal.cents;
      for (const i of sched) {
        acc += i.type === "entrada" ? i.cents : -i.cents;
        if (i.type === "saida" && i.date! <= until && acc < 0) {
          out.push({
            kind: "contas",
            key: `conta:${i.date}:${i.key}`,
            title: `${i.name} vence ${dm(i.date!)}`,
            body: `${brl(i.cents)}${i.autoDebit ? " no débito automático" : ""}: o saldo previsto não cobre, faltam ${brl(-acc)}.`,
            url: "/calendario",
          });
        }
      }
    }
  }

  if (on("ritmo")) {
    const budget = d.budgets.find((b) => b.month === month);
    if (budget) {
      const st = budgetStatus(budget, d.transactions, today);
      if (st.remaining < 0) {
        out.push({ kind: "ritmo", key: `ritmo:${month}:passou`, title: "Passou do teto do dia a dia", body: `${brl(-st.remaining)} acima do teto de ${brl(st.cap)} neste mês.`, url: "/" });
      } else if (st.cap > 0 && st.remaining < st.cap * 0.2) {
        out.push({
          kind: "ritmo",
          key: `ritmo:${month}:20`,
          title: "Dia a dia quase no limite",
          body: `Sobram ${brl(st.remaining)} de ${brl(st.cap)}${st.perWeekend ? ` (${brl(st.perWeekend.total)} por fim de semana)` : ""}.`,
          url: "/",
        });
      }
    }
  }

  if (on("sync")) {
    for (const it of items) {
      const stale = !it.last_synced_at || Date.parse(nowIso) - Date.parse(it.last_synced_at) > 30 * 3600_000;
      const bad = it.status != null && !["UPDATED", "UPDATING"].includes(it.status);
      if (stale || bad) {
        out.push({
          kind: "sync",
          key: `sync:${it.id}:${today}`,
          title: `${it.connector_name ?? "Banco"} sem atualizar`,
          body: bad ? `A conexão está com status ${it.status}. Abra Conexões para reautorizar.` : "Sem sync há mais de 30 horas. Os números podem estar atrasados.",
          url: "/conexoes",
        });
      }
    }
  }

  if (on("assinaturas")) {
    const names = new Map(d.accounts.map((a) => [a.id, a.name.trim()]));
    const charges = d.transactions.map((t) => ({
      id: t.id,
      occurred_on: t.occurred_on,
      description: t.description,
      amount_cents: t.amount_cents,
      account: t.account_id ? (names.get(t.account_id) ?? null) : null,
      auto_reason: t.auto_reason,
      bucket: t.bucket,
      is_inflow: t.is_inflow,
      total_installments: t.total_installments,
    }));
    for (const s of subscriptionStats(charges, today).assinaturas) {
      if (!s.aumentou || !("valor_anterior" in s)) continue;
      out.push({
        kind: "assinaturas",
        key: `assinatura:${s.nome}:${s.ultimo_valor}`,
        title: `${s.nome} ficou mais cara`,
        body: `De ${brl(Math.round(Number(s.valor_anterior) * 100))} para ${brl(Math.round(s.ultimo_valor * 100))}.`,
        url: "/assinaturas",
      });
    }
  }

  if (on("fora_do_padrao")) {
    for (const a of findAnomalies(d.transactions, today, 3)) {
      out.push({ kind: "fora_do_padrao", key: `anomalia:${a.tx.id}`, title: "Gasto fora do padrão", body: `${a.tx.description.trim()}: ${a.reason}.`, url: "/saude-dos-dados#fora-do-padrao" });
    }
  }
  return out;
}

/** Resumo do dia: o que entrou no dia a dia hoje e quanto ainda dá para gastar. */
export function dailySummary(d: AllData, today: string): { title: string; body: string; url: string } | null {
  const month = monthOf(today);
  const budget = d.budgets.find((b) => b.month === month);
  if (!budget) return null;
  const st = budgetStatus(budget, d.transactions, today);
  const todays = dailyTransactions(d.transactions, { month, today, controlStart: budget.control_start }).filter((t) => t.occurred_on === today);
  const spent = todays.reduce((s, t) => s + t.amount_cents, 0);
  const pending = d.transactions.filter((t) => t.occurred_on === today && t.bucket === "sem_categoria").length;
  const first = todays.length ? `Hoje: ${brl(spent)} em ${todays.length} ${todays.length === 1 ? "gasto" : "gastos"}.` : "Hoje sem gastos do dia a dia.";
  const rest =
    st.remaining >= 0
      ? ` Ainda dá para gastar ${brl(st.remaining)} no mês${st.perWeekend ? ` (${brl(st.perWeekend.total)} por fim de semana)` : ""}.`
      : ` Passou ${brl(-st.remaining)} do teto do mês.`;
  const tri = pending ? ` ${pending} sem categoria esperando na Triagem.` : "";
  return { title: "Resumo do dia", body: first + rest + tri, url: pending ? "/triagem" : "/" };
}
