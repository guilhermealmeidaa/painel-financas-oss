import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowDownLeft, Bot, Inbox, Link2, Wand2 } from "lucide-react";
import { AutoDecisions } from "@/components/auto-decisions";
import { IncomesReview, MergeSuggestions, type Suggestion } from "@/components/merge-suggestions";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { RulesEditor } from "@/components/rules-editor";
import { TriageList } from "@/components/triage-list";
import { addDays, todayISO } from "@/lib/dates";
import { suggestMerges } from "@/lib/merge";
import { createClient } from "@/lib/supabase/server";

async function TriagemContent() {
  await connection();
  const supabase = await createClient();
  const today = todayISO();
  const since = addDays(today, -60);
  const [{ data: txs }, { data: rules }, { data: accounts }, { data: manual }, { data: bankForMerge }, { data: autos }, { data: bankIncomes }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, occurred_on, description, amount_cents, method, account_id, source")
        .eq("bucket", "sem_categoria")
        .eq("superseded", false)
        .lte("occurred_on", today)
        .order("occurred_on", { ascending: false })
        .limit(200),
      supabase.from("categorization_rules").select("id, pattern, bucket").order("pattern"),
      supabase.from("accounts").select("id, name"),
      // lançamentos seus ainda sem par no banco
      supabase
        .from("transactions")
        .select("id, occurred_on, description, amount_cents, method")
        .eq("source", "manual")
        .is("external_id", null)
        .eq("superseded", false)
        .gte("occurred_on", since),
      // compras do banco que podem ser a outra ponta (ainda não juntadas nem travadas por você)
      supabase
        .from("transactions")
        .select("id, occurred_on, description, amount_cents, method")
        .eq("source", "pluggy")
        .is("manual_id", null)
        .eq("user_locked", false)
        .eq("is_inflow", false)
        .in("bucket", ["sem_categoria", "lazer", "mercado"])
        .gte("occurred_on", addDays(since, -1))
        .lte("occurred_on", today),
      // o que o painel decidiu sozinho nos últimos 60 dias (até hoje)
      supabase
        .from("transactions")
        .select("id, occurred_on, description, amount_cents, bucket, auto_reason, fee_cents, account_id, linked_tx_id, manual_id")
        .not("auto_reason", "is", null)
        .gte("occurred_on", since)
        .lte("occurred_on", today)
        .order("occurred_on", { ascending: false })
        .limit(500),
      supabase.from("incomes").select("id, month, description, amount_cents, kind").eq("source", "banco").eq("status", "auto").order("month"),
    ]);

  const names = new Map((accounts ?? []).map((a) => [a.id, a.name.trim()]));
  const items = (txs ?? []).map((t) => ({ ...t, account: t.account_id ? (names.get(t.account_id) ?? null) : null, duplicateOf: null }));

  const byId = new Map([...(manual ?? []), ...(bankForMerge ?? [])].map((t) => [t.id, t]));
  const suggestions: Suggestion[] = suggestMerges(manual ?? [], bankForMerge ?? []).map((s) => ({
    manual: byId.get(s.manualId)!,
    bank: s.bankIds.map((id) => byId.get(id)!),
    sum: s.sum,
  }));

  const descById = new Map((autos ?? []).map((a) => [a.id, a.description]));
  const autoItems = (autos ?? []).map((a) => ({
    ...a,
    auto_reason: a.auto_reason!,
    account: a.account_id ? (names.get(a.account_id) ?? null) : null,
    linked: a.linked_tx_id ? (descById.get(a.linked_tx_id) ?? null) : null,
  }));

  return (
    <>
      {suggestions.length > 0 && (
        <Panel title="Lançamentos seus com par no banco" subtitle="Juntar usa o valor real do banco com o nome e a categoria que você deu" icon={Link2} iconClass="bg-warning/15 text-warning">
          <MergeSuggestions items={suggestions} />
        </Panel>
      )}

      <Panel
        title={`Sem categoria (${items.length})`}
        subtitle="Lazer e mercado contam no dia a dia; fixo e parcela já estão na projeção; ignorar some das contas."
        icon={Inbox}
        action={
          <Link href="/conexoes" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            Conexões
          </Link>
        }
      >
        <TriageList items={items} />
      </Panel>

      <Panel title="Entradas do banco" subtitle="Já contam na projeção; confirme ou diga que não é entrada" icon={ArrowDownLeft} iconClass="bg-positive/10 text-positive">
        <IncomesReview items={bankIncomes ?? []} />
      </Panel>

      <Panel
        title="Decisões automáticas"
        subtitle="O que o painel classificou sozinho nos últimos 60 dias. Desfazer devolve a decisão pra você."
        icon={Bot}
        iconClass="bg-primary/10 text-primary"
      >
        <AutoDecisions items={autoItems} />
      </Panel>

      <Panel title="Regras automáticas" subtitle="Aplicadas a cada sync, antes de cair aqui" icon={Wand2} iconClass="bg-positive/10 text-positive">
        <RulesEditor rules={rules ?? []} />
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Triagem" subtitle="Classifique os gastos que chegaram do banco" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <TriagemContent />
      </Suspense>
    </>
  );
}
