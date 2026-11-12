import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { monthOf, todayISO } from "@/lib/dates";
import { serverSetup } from "@/lib/setup-status";

export type StepId = "servidor" | "preferencias" | "plano" | "bancos" | "triagem" | "sync" | "claude";

export interface OnboardingStep {
  id: StepId;
  title: string;
  done: boolean;
  optional: boolean;
  href: string;
}

/**
 * Situação de cada etapa da configuração (tela Primeiros passos e faixa da Visão geral).
 * Só conta linhas; nunca lê valores.
 */
export async function onboardingStatus(supabase: SupabaseClient<Database>) {
  const month = monthOf(todayISO());
  const [settings, items, incomes, budgets, pending, tokens] = await Promise.all([
    supabase.from("settings").select("label_lazer, label_mercado, self_names, self_tax_ids").maybeSingle(),
    supabase.from("pluggy_items").select("id", { count: "exact", head: true }),
    supabase.from("incomes").select("id", { count: "exact", head: true }).eq("month", month),
    supabase.from("monthly_budgets").select("id", { count: "exact", head: true }).eq("month", month),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("bucket", "sem_categoria"),
    supabase.from("api_tokens").select("id", { count: "exact", head: true }).is("revoked_at", null),
  ]);
  const setup = serverSetup();
  const connected = (items.count ?? 0) > 0;
  const steps: OnboardingStep[] = [
    { id: "servidor", title: "Chaves do servidor", done: setup.missingRequired.length === 0, optional: false, href: "/primeiros-passos#servidor" },
    { id: "preferencias", title: "Preferências", done: Boolean(settings.data), optional: false, href: "/primeiros-passos#preferencias" },
    { id: "plano", title: "Plano do mês", done: (incomes.count ?? 0) > 0 && (budgets.count ?? 0) > 0, optional: false, href: "/planejamento" },
    { id: "bancos", title: "Bancos conectados", done: connected, optional: false, href: "/conexoes" },
    { id: "triagem", title: "Triagem em dia", done: connected && (pending.count ?? 0) === 0, optional: false, href: "/triagem" },
    { id: "sync", title: "Sync automático", done: setup.items.find((i) => i.key === "CRON_SECRET")?.ok ?? false, optional: true, href: "/primeiros-passos#sync" },
    { id: "claude", title: "Acesso do Claude", done: (tokens.count ?? 0) > 0, optional: true, href: "/acesso-claude" },
  ];
  const required = steps.filter((s) => !s.optional);
  return {
    steps,
    settings: settings.data,
    pending: pending.count ?? 0,
    setup,
    requiredDone: required.filter((s) => s.done).length,
    requiredTotal: required.length,
    next: required.find((s) => !s.done) ?? null,
  };
}
