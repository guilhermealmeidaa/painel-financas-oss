import { Suspense } from "react";
import { connection } from "next/server";
import { Repeat } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { addDays, formatDay, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { groupSubscriptions, subscriptionKey } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";

async function Content() {
  await connection();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: txs }, { data: accounts }] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_on, description, amount_cents, account_id, auto_reason")
      .eq("bucket", "assinatura")
      .eq("is_inflow", false)
      .eq("superseded", false)
      .gte("occurred_on", addDays(today, -70))
      .lte("occurred_on", today),
    supabase.from("accounts").select("id, name"),
  ]);
  const names = new Map((accounts ?? []).map((a) => [a.id, a.name.trim()]));
  const { items, total_cents } = groupSubscriptions(
    (txs ?? []).map((t) => ({
      ...t,
      account: t.account_id ? (names.get(t.account_id) ?? null) : null,
      key: subscriptionKey(t.description, t.auto_reason),
    })),
  );

  return (
    <>
      <Panel title="Total por mês" subtitle="pelo último débito de cada assinatura nos últimos 70 dias" icon={Repeat}>
        <Money cents={total_cents} />
        <p className="text-xs text-muted-foreground">
          Assinaturas não entram no “ainda posso gastar”, mas contam no saldo do mês e são projetadas pelos próximos meses (média dos 2 últimos débitos).
        </p>
      </Panel>
      <Panel title={`Assinaturas (${items.length})`}>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma assinatura identificada. As regras ficam na Triagem.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {items.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    último débito {formatDay(s.last_on)}
                    {s.account ? ` · ${s.account}` : ""} · {s.charges} cobrança{s.charges > 1 ? "s" : ""} no período
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatBRL(s.monthly_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Assinaturas" subtitle="Serviços cobrados todo mês" />
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
