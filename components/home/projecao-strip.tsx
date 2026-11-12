import Link from "next/link";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Panel } from "@/components/panel";
import { formatMonthShort } from "@/lib/dates";
import { formatBRLShort } from "@/lib/money";
import type { ProjectionRow } from "@/lib/projection";
import { cn } from "@/lib/utils";

/** Faixa com o saldo de cada mês da projeção; destaca o mês selecionado e os alertas. */
export function ProjecaoStrip({ rows, selected, className }: { rows: ProjectionRow[]; selected: string; className?: string }) {
  return (
    <Panel
      title="Próximos meses"
      subtitle="saldo na conta no fim de cada mês, se nada mudar"
      icon={TrendingUp}
      iconClass="bg-positive/10 text-positive"
      action={
        <Link href="/projecao" className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-border transition-colors hover:bg-muted">
          Ver projeção
        </Link>
      }
      className={className}
    >
      <ul className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {rows.map((r) => {
          const alert = r.alerts.lowBalance || r.alerts.negativeMonth;
          return (
            <li key={r.month} className="w-[136px] shrink-0 snap-start">
              <Link
                href={`/?mes=${r.month}`}
                className={cn(
                  "flex flex-col gap-1 rounded-[14px] bg-muted/70 p-3 transition-colors hover:bg-muted",
                  r.month === selected && "bg-gradient-to-b from-primary/5 to-primary/14 ring-[1.5px] ring-primary hover:bg-transparent",
                )}
              >
                <span className="text-[12px] font-semibold capitalize">{formatMonthShort(r.month)}</span>
                <span className={cn("text-[17px] font-bold tracking-[-0.02em] tabular-nums", r.alerts.lowBalance && "text-destructive")}>
                  {formatBRLShort(r.balance)}
                </span>
                <span className={cn("flex items-center gap-1 text-[11px] tabular-nums", r.net < 0 ? "text-destructive" : "text-positive")}>
                  {alert && <AlertTriangle className="size-3" aria-hidden />}
                  {r.net < 0 ? "" : "+"}
                  {formatBRLShort(r.net)} no mês
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
