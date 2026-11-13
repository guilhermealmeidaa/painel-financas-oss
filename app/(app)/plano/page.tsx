import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarCheck2, Flag, ListChecks, Scale } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { loadAll } from "@/lib/data";
import { formatMonthLong, formatMonthShort, monthOf, monthsBetween, todayISO } from "@/lib/dates";
import { debtSummary } from "@/lib/debt";
import { formatBRL, formatBRLShort } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

async function Content() {
  await connection();
  const d = await loadAll();
  const today = todayISO();
  const s = debtSummary(d, today);
  const supabase = await createClient();
  const { data: snaps } = await supabase.from("month_snapshots").select("month, kind, projected_balance_cents, bank_balance_cents, debt_remaining_cents").order("month");
  const pct = s.total ? Math.round((s.paid / s.total) * 100) : 0;
  const monthsToFree = s.freeMonth ? monthsBetween(monthOf(today), s.freeMonth) + 1 : 0;
  const maxMonth = Math.max(...s.perMonth.map((m) => m.cents), 1);
  const months = [...new Set((snaps ?? []).map((x) => x.month))];
  const byKind = (m: string, k: string) => (snaps ?? []).find((x) => x.month === m && x.kind === k);

  return (
    <>
      <Panel title="Sair do crédito" subtitle="empréstimos, veículo, parcelas antigas dos cartões e compras parceladas do plano" icon={Flag} iconClass="bg-positive/10 text-positive">
        {s.debts.length === 0 ? (
          <p className="text-sm">Nenhuma dívida cadastrada no plano daqui para frente. 🎉</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Falta pagar</p>
                <p className="text-lg font-bold tabular-nums">{formatBRL(s.remaining)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Já quitado</p>
                <p className="text-lg font-bold tabular-nums text-positive">{formatBRL(s.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Livre em</p>
                <p className="text-lg font-bold">{s.freeMonth ? cap(formatMonthLong(s.freeMonth)) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Faltam</p>
                <p className="text-lg font-bold">{monthsToFree} {monthsToFree === 1 ? "mês" : "meses"}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-positive" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {pct}% do total de {formatBRL(s.total)} já pago
              </p>
            </div>
          </>
        )}
      </Panel>

      {s.debts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Cada dívida" subtitle="em ordem de quando termina" icon={ListChecks}>
            <ul className="flex flex-col gap-3 text-sm">
              {s.debts.map((x) => {
                const p = x.total ? Math.round((x.paid / x.total) * 100) : 0;
                return (
                  <li key={`${x.kind}-${x.name}`} className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium break-words">{x.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {x.kind} · {formatBRL(x.monthly)}/mês · {x.monthsLeft} {x.monthsLeft === 1 ? "parcela" : "parcelas"} · até{" "}
                          <span className="capitalize">{formatMonthShort(x.endMonth)}</span>
                        </p>
                      </div>
                      <p className="shrink-0 text-right whitespace-nowrap tabular-nums">
                        <span className="font-medium">{formatBRL(x.remaining)}</span>
                        <span className="block text-[11px] text-muted-foreground">falta</span>
                      </p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-positive/80" style={{ width: `${p}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Quanto sai por mês" subtitle="parcelas de dívida até ficar livre (fora o dia a dia e as contas)" icon={CalendarCheck2}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {s.perMonth.map((m) => (
                <li key={m.month} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2">
                  <span className="text-xs capitalize text-muted-foreground">{formatMonthShort(m.month)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(m.cents / maxMonth) * 100}%` }} />
                  </span>
                  <span className="text-right text-xs whitespace-nowrap tabular-nums">{formatBRLShort(m.cents)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Panel title="Planejado × realizado" subtitle="foto do início de cada mês (o plano) e da virada (o que aconteceu)" icon={Scale}>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">As fotos começam no próximo sync; o primeiro mês completo aparece na virada de mês.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {months.map((m) => {
              const ini = byKind(m, "inicio");
              const fim = byKind(m, "fim");
              const diff = ini?.projected_balance_cents != null && fim?.bank_balance_cents != null ? fim.bank_balance_cents - ini.projected_balance_cents : null;
              return (
                <li key={m} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{cap(formatMonthLong(m))}</p>
                    <p className="text-xs text-muted-foreground">
                      plano: {ini?.projected_balance_cents != null ? formatBRL(ini.projected_balance_cents) : "—"} no fim
                      {ini?.debt_remaining_cents != null && ` · dívida ${formatBRLShort(ini.debt_remaining_cents)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right whitespace-nowrap tabular-nums">
                    <p className="font-medium">{fim?.bank_balance_cents != null ? formatBRL(fim.bank_balance_cents) : "em andamento"}</p>
                    {diff != null && (
                      <p className={cn("text-[11px]", diff >= 0 ? "text-positive" : "text-destructive")}>
                        {diff >= 0 ? "+" : "−"}
                        {formatBRL(Math.abs(diff))} {diff >= 0 ? "acima" : "abaixo"} do plano
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Plano" subtitle="quanto falta para sair do crédito e se o mês está saindo como planejado" />
      <Suspense fallback={<div className="surface h-64 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
