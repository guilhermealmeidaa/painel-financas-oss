import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarCog, Coffee, Plane, Receipt, SlidersHorizontal, Wallet } from "lucide-react";
import { MonthHeader } from "@/components/month-header";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { BudgetEditor, CopyPrevButton, FixedEditor, IncomesEditor, PeriodsEditor, PreferencesEditor } from "@/components/plan/plan-editors";
import { bucketLabels } from "@/lib/labels";
import { addMonths, formatMonthLong, monthOf, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { isMonth } from "@/lib/validate";

async function Content({ month }: { month: string }) {
  await connection();
  const supabase = await createClient();
  const [{ data: incomes }, { data: fixed }, { data: budget }, { data: cards }, { data: settings }, { data: periods }] = await Promise.all([
    supabase.from("incomes").select("id, description, kind, amount_cents").eq("month", month).order("amount_cents", { ascending: false }),
    supabase.from("fixed_expenses").select("id, name, category, account_id, amount_cents").eq("month", month),
    supabase.from("monthly_budgets").select("id, cap_cents, method, control_start, budget_allocations(bucket, amount_cents)").eq("month", month).maybeSingle(),
    supabase.from("accounts").select("id, name").eq("kind", "credit_card").order("name"),
    supabase.from("settings").select("label_lazer, label_mercado, self_names, self_tax_ids").maybeSingle(),
    supabase.from("budget_periods").select("id, name, start_date, end_date, cap_cents").eq("month", month).order("start_date"),
  ]);
  const labels = bucketLabels(settings);
  const totalIn = (incomes ?? []).reduce((s, i) => s + i.amount_cents, 0);
  const totalFixed = (fixed ?? []).reduce((s, f) => s + f.amount_cents, 0);
  const alloc = (budget?.budget_allocations ?? []) as { bucket: string; amount_cents: number }[];
  const cap = budget?.cap_cents ?? 0;
  const empty = !(incomes?.length || fixed?.length || budget);

  return (
    <>
      <Panel title={`Resumo de ${formatMonthLong(month).split(" ")[0]}`} icon={CalendarCog}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Entradas</dt>
            <dd className="font-semibold tabular-nums text-positive">{formatBRL(totalIn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fixos</dt>
            <dd className="font-semibold tabular-nums">− {formatBRL(totalFixed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Teto do dia a dia</dt>
            <dd className="font-semibold tabular-nums">− {formatBRL(cap)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sobra (antes de faturas e parcelas)</dt>
            <dd className="tabular-nums">
              <Money cents={totalIn - totalFixed - cap} size="md" />
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          A projeção ainda soma a fatura do crédito do mês anterior e as parcelas novas. Veja em Projeção.
        </p>
        {empty && (
          <div className="flex flex-col gap-2 rounded-2xl bg-warning/15 p-3 text-sm sm:flex-row sm:items-center">
            <span className="flex-1">Mês vazio. Quer copiar entradas, fixos e teto do mês anterior?</span>
            <CopyPrevButton month={month} />
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Panel title="Entradas" subtitle="salário, 13º, freela…" icon={Wallet} iconClass="bg-positive/10 text-positive">
          <IncomesEditor month={month} rows={incomes ?? []} />
        </Panel>

        <Panel title="Gastos fixos" subtitle="empréstimos, financiamentos, contas e parcelas antigas dos cartões" icon={Receipt}>
          <FixedEditor month={month} rows={fixed ?? []} cards={cards ?? []} />
        </Panel>

        <Panel title="Teto do dia a dia" subtitle={`quanto pode ir para ${labels.lazer.toLowerCase()} e ${labels.mercado.toLowerCase()} no mês`} icon={Coffee} iconClass="bg-mercado/10 text-mercado">
          <BudgetEditor
            key={budget?.id ?? `novo-${month}`}
            month={month}
            budget={
              budget
                ? {
                    cap_cents: budget.cap_cents,
                    method: budget.method,
                    control_start: budget.control_start,
                    lazer: alloc.find((a) => a.bucket === "lazer")?.amount_cents ?? 0,
                    mercado: alloc.find((a) => a.bucket === "mercado")?.amount_cents ?? 0,
                  }
                : null
            }
          />
        </Panel>

        <Panel title="Períodos especiais" subtitle="viagem, feriado… com teto próprio dentro do teto do mês" icon={Plane}>
          <PeriodsEditor month={month} rows={periods ?? []} capCents={budget?.cap_cents ?? null} />
        </Panel>

        <Panel title="Preferências" subtitle="nomes do dia a dia e quem é você nos extratos" icon={SlidersHorizontal}>
          <PreferencesEditor
            initial={{
              label_lazer: labels.lazer,
              label_mercado: labels.mercado,
              self_names: settings?.self_names ?? [],
              self_tax_ids: settings?.self_tax_ids ?? [],
            }}
          />
        </Panel>
      </div>
    </>
  );
}

export default async function Page(props: PageProps<"/planejamento">) {
  const sp = await props.searchParams;
  await connection();
  const current = monthOf(todayISO());
  const month = isMonth(sp.mes) ? sp.mes : current;
  return (
    <>
      <MonthHeader month={month} basePath="/planejamento" min={addMonths(current, -12)} max={addMonths(current, 36)} current={current} />
      <Suspense key={month} fallback={<div className="surface h-48 animate-pulse" />}>
        <Content month={month} />
      </Suspense>
    </>
  );
}
