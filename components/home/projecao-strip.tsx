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
        <Link href="/projecao" className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap ring-1 ring-border transition-colors hover:bg-muted">
          Ver projeção
        </Link>
      }
      className={className}
    >
      {/* rola na horizontal; o esmaecido à direita mostra que tem mais meses */}
      <ul className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 py-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent)] [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {rows.map((r) => {
          const alert = r.alerts.lowBalance || r.alerts.negativeMonth;
          return (
            <li key={r.month} className="w-[136px] shrink-0 snap-start">
              <Link
                href={`/?mes=${r.month}`}
                title={alert ? (r.alerts.negativeMonth ? "Mês fecha no negativo" : "Saldo abaixo de R$ 500") : undefined}
                className={cn(
                  "flex h-full flex-col gap-1 rounded-[14px] bg-muted/70 p-3 transition-colors hover:bg-muted",
                  r.month === selected && "bg-gradient-to-b from-primary/5 to-primary/14 ring-[1.5px] ring-primary ring-inset hover:bg-transparent",
                )}
              >
                <span className="flex items-center justify-between gap-1 text-[12px] font-semibold capitalize">
                  {formatMonthShort(r.month)}
                  {alert && <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-label="alerta" />}
                </span>
                <span className={cn("text-[17px] font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums", r.alerts.lowBalance && "text-destructive")}>
                  {formatBRLShort(r.balance)}
                </span>
                <span className={cn("text-[11px] whitespace-nowrap tabular-nums", r.net < 0 ? "text-destructive" : "text-positive")}>
                  {r.net < 0 ? "" : "+"}
                  {formatBRLShort(r.net)} no mês
                </span>
              </Link>
            </li>
          );
        })}
        {/* folga no fim para o último mês sair do esmaecido */}
        <li aria-hidden className="w-8 shrink-0" />
      </ul>
    </Panel>
  );
}
