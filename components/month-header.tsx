import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Cabeçalho com navegação de mês (‹ › Dezembro 2026). Deixa espaço à direita para o "Adicionar" do desktop. */
export function MonthHeader({
  month,
  basePath,
  min,
  max,
  current,
}: {
  month: string;
  basePath: string;
  min?: string;
  max?: string;
  current: string;
}) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const href = (m: string) => (m === current ? basePath : `${basePath}?mes=${m}`);
  const arrow = (m: string, disabled: boolean, Icon: typeof ChevronLeft, label: string) =>
    disabled ? (
      <span className="grid size-8 place-items-center text-muted-foreground/30" aria-hidden>
        <Icon className="size-[18px]" />
      </span>
    ) : (
      <Link href={href(m)} aria-label={label} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Icon className="size-[18px]" />
      </Link>
    );

  return (
    <header className="surface flex h-16 items-center gap-0.5 px-3 sm:px-4 lg:pr-44">
      {arrow(prev, Boolean(min && prev < min), ChevronLeft, "Mês anterior")}
      {arrow(next, Boolean(max && next > max), ChevronRight, "Próximo mês")}
      <h1 className="ml-3 text-[22px] font-bold tracking-[-0.03em] sm:text-[26px]">
        {MONTHS[Number(month.slice(5, 7)) - 1]} <span className="font-medium text-muted-foreground/70">{month.slice(0, 4)}</span>
      </h1>
      {month !== current && (
        <Link href={basePath} className={cn("ml-auto rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground")}>
          Hoje
        </Link>
      )}
    </header>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="surface flex min-h-16 flex-col justify-center px-5 py-3 sm:px-6 lg:pr-44">
      <h1 className="text-[22px] font-bold tracking-[-0.03em] sm:text-[26px]">{title}</h1>
      {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
