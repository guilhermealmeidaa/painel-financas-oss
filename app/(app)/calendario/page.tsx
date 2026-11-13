import { Suspense } from "react";
import { CalendarDays, CircleHelp } from "lucide-react";
import { MonthHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { bankBalance, loadAll } from "@/lib/data";
import { addDays, addMonths, lastDayOfMonth, monthOf, todayISO, weekday } from "@/lib/dates";
import { formatBRL, formatBRLShort } from "@/lib/money";
import { monthSchedule, type ScheduleItem } from "@/lib/schedule";
import { isMonth } from "@/lib/validate";
import { cn } from "@/lib/utils";

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const DOW = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function status(i: ScheduleItem, today: string) {
  if (i.type === "entrada") return i.paid ? "recebida" : "prevista";
  if (i.paid) return "paga";
  return i.date && i.date < today ? "atrasada?" : i.autoDebit ? "débito automático" : "a pagar";
}

async function Content({ month }: { month: string }) {
  const d = await loadAll();
  const today = todayISO();
  const items = monthSchedule(d, month, today);
  const dated = items.filter((i) => i.date);
  const undated = items.filter((i) => !i.date);
  const byDay = new Map<string, ScheduleItem[]>();
  for (const i of dated) byDay.set(i.date!, [...(byDay.get(i.date!) ?? []), i]);

  // saldo previsto ao fim de cada dia (só no mês atual): saldo de hoje + entradas previstas − contas não pagas, em ordem
  const isCurrent = month === monthOf(today);
  const bal = isCurrent ? bankBalance(d) : null;
  const running = new Map<string, number>();
  if (bal) {
    let acc = bal.cents;
    for (const day of [...byDay.keys()].sort()) {
      if (day < today) continue;
      for (const i of byDay.get(day)!) if (!i.paid) acc += i.type === "entrada" ? i.cents : -i.cents;
      running.set(day, acc);
    }
  }

  const last = lastDayOfMonth(month);
  const lead = weekday(month);
  const days: string[] = [];
  for (let x = month; x <= last; x = addDays(x, 1)) days.push(x);
  const out = items.filter((i) => i.type === "saida").reduce((s, i) => s + i.cents, 0);
  const inn = items.filter((i) => i.type === "entrada").reduce((s, i) => s + i.cents, 0);

  return (
    <>
      <Panel title="Mês em datas" subtitle="faturas, contas fixas e entradas; o dia é o vencimento conhecido ou o provável" icon={CalendarDays}>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
          {WEEK.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const owe = list.some((i) => i.type === "saida" && !i.paid);
            const gets = list.some((i) => i.type === "entrada");
            const neg = (running.get(day) ?? 0) < 0;
            return (
              <a
                key={day}
                href={list.length ? `#d-${day}` : undefined}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] text-foreground",
                  list.length ? "bg-muted/70 hover:bg-muted" : "opacity-60",
                  day === today && "ring-[1.5px] ring-primary",
                  neg && "bg-destructive/10",
                )}
              >
                <span className="font-medium tabular-nums">{Number(day.slice(8))}</span>
                <span className="flex h-1.5 gap-0.5">
                  {owe && <span className="size-1.5 rounded-full bg-destructive" />}
                  {list.some((i) => i.type === "saida" && i.paid) && <span className="size-1.5 rounded-full bg-muted-foreground/60" />}
                  {gets && <span className="size-1.5 rounded-full bg-positive" />}
                </span>
              </a>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-destructive" /> a pagar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" /> paga
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-positive" /> entrada
          </span>
          {bal && <span>fundo vermelho: o saldo previsto fica negativo</span>}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Saem {formatBRL(out)} · entram {formatBRL(inn)} no mês
        </p>
      </Panel>

      <Panel title="Agenda" subtitle={bal ? `saldo de hoje nas contas: ${formatBRL(bal.cents)}` : undefined}>
        {dated.length === 0 && <p className="text-sm text-muted-foreground">Nada com data neste mês.</p>}
        <ol className="flex flex-col gap-4">
          {[...byDay.keys()].sort().map((day) => (
            <li key={day} id={`d-${day}`} className="scroll-mt-24">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <p className={cn("text-[13px] font-semibold", day === today && "text-primary")}>
                  {Number(day.slice(8))}/{day.slice(5, 7)} <span className="font-normal text-muted-foreground capitalize">{DOW.format(new Date(`${day}T12:00:00Z`))}</span>
                  {day === today && <span className="ml-1.5 text-[11px] font-medium">hoje</span>}
                </p>
                {running.has(day) && (
                  <p className={cn("text-[11.5px] tabular-nums", running.get(day)! < 0 ? "text-destructive" : "text-muted-foreground")}>
                    saldo previsto {formatBRLShort(running.get(day)!)}
                  </p>
                )}
              </div>
              <ul className="divide-y divide-border rounded-2xl bg-muted/50 px-3 text-sm">
                {byDay.get(day)!.map((i) => (
                  <Row key={i.key} i={i} today={today} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Panel>

      {undated.length > 0 && (
        <Panel title="Sem data conhecida" subtitle="ainda não há pagamento anterior para saber o dia" icon={CircleHelp}>
          <ul className="divide-y divide-border text-sm">
            {undated.map((i) => (
              <Row key={i.key} i={i} today={today} />
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Row({ i, today }: { i: ScheduleItem; today: string }) {
  const s = status(i, today);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className={cn("line-clamp-2 break-words", i.paid && i.type === "saida" && "text-muted-foreground line-through")}>{i.name}</p>
        <p className={cn("text-xs", s === "atrasada?" ? "text-destructive" : "text-muted-foreground")}>{s}</p>
      </div>
      <span className={cn("shrink-0 font-medium whitespace-nowrap tabular-nums", i.type === "entrada" ? "text-positive" : i.paid && "text-muted-foreground")}>
        {i.type === "entrada" ? "+" : "−"}
        {formatBRL(i.cents)}
      </span>
    </li>
  );
}

export default async function Page(props: PageProps<"/calendario">) {
  const sp = await props.searchParams;
  const current = monthOf(todayISO());
  const month = isMonth(sp.mes) ? sp.mes : current;
  return (
    <>
      <MonthHeader month={month} basePath="/calendario" min={addMonths(current, -3)} max={addMonths(current, 12)} current={current} />
      <Suspense key={month} fallback={<div className="surface h-96 animate-pulse" />}>
        <Content month={month} />
      </Suspense>
    </>
  );
}
