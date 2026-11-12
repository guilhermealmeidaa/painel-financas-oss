import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { formatBRL } from "@/lib/money";
import type { ProjectionRow } from "@/lib/projection";
import { cn } from "@/lib/utils";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Saldo previsto no fim do mês + barra segmentada de para onde vai a renda. */
export function SaldoCard({ row, prevBalance, className }: { row: ProjectionRow; prevBalance: number; className?: string }) {
  const sobra = row.net;
  const segments = [
    { label: "Fixos", value: row.fixed, color: "bg-chart-2" },
    { label: "Faturas dos cartões", value: row.creditInvoice, color: "bg-chart-1" },
    { label: "Parcelas novas", value: row.installments, color: "bg-mercado" },
    { label: "Avulsos e assinaturas", value: row.extras, color: "bg-warning" },
    { label: "Dia a dia", value: row.daily, color: "bg-chart-5" },
  ].filter((s) => s.value > 0);
  const totalOut = segments.reduce((s, x) => s + x.value, 0);
  const base = Math.max(row.income, totalOut + Math.max(sobra, 0), 1);
  const first = row.opening != null ? { label: "Hoje nas contas", value: row.opening } : null;

  return (
    <Panel title="Saldo previsto" icon={Wallet} className={className}>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
        <Money cents={row.balance} size="xl" className={cn(row.balance < 0 && "text-destructive")} />
        <div className="text-[13px] leading-snug sm:border-l sm:border-border sm:pl-6">
          {sobra >= 0 ? (
            <p className="flex items-center gap-1 font-semibold text-positive">
              <ArrowUpRight className="size-4" strokeWidth={2.2} /> {pct(sobra, row.income)}% da renda sobra
            </p>
          ) : (
            <p className="flex items-center gap-1 font-semibold text-destructive">
              <ArrowDownRight className="size-4" strokeWidth={2.2} /> mês fecha {formatBRL(sobra)} sozinho
            </p>
          )}
          <p className="mt-0.5 max-w-[34ch] text-muted-foreground">
            {row.opening != null
              ? "na conta no fim do mês, depois de pagar o que ainda falta"
              : `na conta no fim do mês · começa com ${formatBRL(prevBalance)}`}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-4 pt-2">
        <div className="flex h-2 w-full gap-[3px]" aria-hidden>
          {segments.map((s) => (
            <div key={s.label} className={cn("h-full rounded-full", s.color)} style={{ width: `${(s.value / base) * 100}%` }} />
          ))}
          {sobra > 0 && <div className="h-full rounded-full bg-positive" style={{ width: `${(sobra / base) * 100}%` }} />}
          {sobra <= 0 && totalOut < base && <div className="h-full flex-1 rounded-full bg-muted" />}
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:flex xl:justify-between">
          {first && <Item label={first.label} value={formatBRL(first.value)} />}
          <Item label={row.opening != null ? "Ainda entra" : "Renda"} value={formatBRL(row.income)} />
          {segments.map((s) => (
            <Item key={s.label} dot={s.color} label={s.label} value={`− ${formatBRL(s.value)}`} pct={pct(s.value, row.income)} />
          ))}
          <Item
            dot={sobra >= 0 ? "bg-positive" : "bg-destructive"}
            label={sobra >= 0 ? "Sobra" : "Falta"}
            value={formatBRL(sobra)}
            pct={sobra >= 0 ? pct(sobra, row.income) : undefined}
            strong
            className={sobra >= 0 ? "text-positive" : "text-destructive"}
          />
        </dl>
      </div>
    </Panel>
  );
}

function Item({
  label,
  value,
  dot,
  pct: p,
  strong,
  className,
}: {
  label: string;
  value: string;
  dot?: string;
  pct?: number;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className={cn("flex items-center gap-1.5 text-[12px] text-muted-foreground", strong && "font-medium text-foreground")}>
        {dot && <span className={cn("size-[7px] shrink-0 rounded-full", dot)} />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn("mt-0.5 text-[14px] font-semibold whitespace-nowrap tabular-nums", className)}>
        {value}
        {p != null && <span className="ml-1 text-[11.5px] font-normal text-muted-foreground">{p}%</span>}
      </dd>
    </div>
  );
}
