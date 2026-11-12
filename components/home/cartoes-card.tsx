import Link from "next/link";
import { CreditCard } from "lucide-react";
import { CardCarousel } from "@/components/card-carousel";
import { CardTile } from "@/components/card-tile";
import { Money } from "@/components/money";
import { Eyebrow, Panel } from "@/components/panel";
import { cardStyle } from "@/lib/banks";
import { formatMonthLong, formatMonthShort } from "@/lib/dates";
import type { CardInvoice } from "@/lib/invoices";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Faturas do mês em "cartões" roláveis + as próximas 3 faturas com a linha de tendência. */
export function CartoesCard({
  month,
  cards,
  total,
  upcoming,
  className,
}: {
  month: string;
  cards: CardInvoice[];
  total: number;
  upcoming: { month: string; total: number }[];
  className?: string;
}) {
  const max = Math.max(...upcoming.map((u) => u.total), 1);
  // altura do ponto em cada coluna (0 = topo do gráfico, 100 = base)
  const y = (v: number) => 78 - (v / max) * 52;
  const pts = upcoming.map((u, i) => ({ x: ((i + 0.5) / upcoming.length) * 100, y: y(u.total) }));
  const ordered = [...cards].sort((a, b) => Number(Boolean(b.fromBank)) - Number(Boolean(a.fromBank)) || b.total - a.total);

  return (
    <Panel title="Cartões" icon={CreditCard} className={cn("overflow-hidden", className)}>
      <div>
        <Eyebrow>Faturas de {formatMonthLong(month).split(" ")[0].toLowerCase()}</Eyebrow>
        <Money cents={total} className="mt-1" />
      </div>

      {ordered.length > 0 ? (
        <CardCarousel
          leading={
            <Link
              href={`/faturas?mes=${month}`}
              className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-border transition-colors hover:bg-muted"
            >
              Ver faturas
            </Link>
          }
        >
          {ordered.map((c) => (
            <CardTile
              key={c.accountId ?? c.name}
              name={c.accountId ? c.name : c.name || "Não informado"}
              dueLabel={formatMonthShort(month)}
              cents={c.total}
              badge={c.estimate ? "Estimativa" : c.real ? "Fechada" : "Aberta"}
              className="w-[248px] shrink-0 snap-start"
            />
          ))}
        </CardCarousel>
      ) : (
        <p className="text-sm text-muted-foreground">Sem fatura neste mês.</p>
      )}

      {ordered.length > 1 && (
        <ul className="-mt-1 flex flex-col">
          {ordered.map((c) => (
            <li key={c.accountId ?? c.name} className="flex items-center gap-2.5 border-b border-border/70 py-2 text-[13px] last:border-0">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: cardStyle(c.name).bg }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.estimate && <span className="text-[11.5px] text-muted-foreground">estimativa</span>}
              <span className="font-semibold tabular-nums">{formatBRL(c.total)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        <Eyebrow className="mb-2.5 font-medium">Próximas faturas</Eyebrow>
        <div className="relative grid grid-cols-3 gap-2">
          {upcoming.map((u, i) => (
            <Link
              key={u.month}
              href={`/faturas?mes=${u.month}`}
              className={cn(
                "relative flex h-[104px] flex-col items-center justify-between overflow-hidden rounded-[14px] bg-muted/70 pt-2.5 pb-2.5 text-center transition-colors hover:bg-muted",
                i === 0 && "bg-card ring-[1.5px] ring-primary hover:bg-card",
              )}
            >
              {i === 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-b from-primary/18 to-primary/5"
                  style={{ top: `${pts[0].y}%` }}
                  aria-hidden
                />
              )}
              <span className="relative text-[12px] font-semibold capitalize">{formatMonthShort(u.month)}</span>
              <span className={cn("relative text-[12px] tabular-nums", i === 0 ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>
                {formatBRL(u.total)}
              </span>
            </Link>
          ))}
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity=".55"
              strokeWidth="1.25"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {pts.map((p, i) => (
            <span
              key={i}
              className={cn(
                "pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] bg-card",
                i === 0 ? "border-primary" : "border-muted-foreground/70",
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}
