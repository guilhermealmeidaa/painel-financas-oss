import { Coffee } from "lucide-react";
import { Money } from "@/components/money";
import { Eyebrow, Panel } from "@/components/panel";
import { TransactionList, type TxItem } from "@/components/transaction-list";
import { WeekendChips } from "@/components/weekend-chips";
import type { MonthStatus } from "@/lib/budget";
import { BUCKET_LABEL } from "@/lib/labels";

type Labels = typeof BUCKET_LABEL;
import { formatBRL, formatBRLShort } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Quanto ainda dá pra gastar no mês, divisão lazer × mercado, ritmo e gastos. */
export function DiaADiaCard({
  status,
  method,
  isCurrent,
  allWeekends,
  skipped,
  items,
  labels = BUCKET_LABEL,
  className,
}: {
  status: MonthStatus;
  method: "credito" | "debito_pix";
  isCurrent: boolean;
  allWeekends: string[];
  skipped: string[];
  items: TxItem[];
  /** nomes das duas categorias do dia a dia */
  labels?: Labels;
  className?: string;
}) {
  const lazer = status.buckets.find((b) => b.bucket === "lazer");
  const mercado = status.buckets.find((b) => b.bucket === "mercado");
  const base = Math.max(status.cap, status.spent, 1);
  const over = status.remaining < 0;
  const w = (v: number) => `${(Math.max(v, 0) / base) * 100}%`;
  const share = (v: number) => Math.round((v / base) * 100);

  return (
    <Panel
      title="Dia a dia"
      subtitle={method === "credito" ? "no crédito, cai na fatura do mês seguinte" : "no débito e no Pix"}
      icon={Coffee}
      iconClass="from-mercado/16 to-mercado/4 text-mercado ring-mercado/10"
      className={className}
    >
      <div>
        <Eyebrow>{over ? "Passou do teto em" : "Ainda posso gastar"}</Eyebrow>
        <Money cents={Math.abs(status.remaining)} className={cn("mt-1", over && "text-destructive")} />
        <p className="mt-1.5 text-[12.5px] text-muted-foreground tabular-nums">
          {formatBRL(status.spent)} de {formatBRL(status.cap)} gastos
        </p>
      </div>

      {status.buckets.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="size-[7px] rounded-full bg-primary" /> {labels.lazer}
              </p>
              <p className="text-[14px] font-semibold tabular-nums">
                {lazer ? formatBRLShort(lazer.spent) : "–"}
                <span className="font-normal text-muted-foreground"> / {lazer ? formatBRLShort(lazer.budgeted) : "–"}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-[12px] text-muted-foreground">
                {labels.mercado} <span className="size-[7px] rounded-full bg-mercado" />
              </p>
              <p className="text-[14px] font-semibold tabular-nums">
                {mercado ? formatBRLShort(mercado.spent) : "–"}
                <span className="font-normal text-muted-foreground"> / {mercado ? formatBRLShort(mercado.budgeted) : "–"}</span>
              </p>
            </div>
          </div>
          <div className="flex h-[26px] w-full gap-[3px] overflow-hidden rounded-[8px] bg-muted text-[11px] font-semibold text-white tabular-nums">
            {lazer && lazer.spent > 0 && (
              <div className="flex min-w-fit items-center rounded-[8px] bg-primary px-2" style={{ width: w(lazer.spent) }}>
                {share(lazer.spent)}%
              </div>
            )}
            {mercado && mercado.spent > 0 && (
              <div className="flex min-w-fit items-center justify-end rounded-[8px] bg-mercado px-2" style={{ width: w(mercado.spent) }}>
                {share(mercado.spent)}%
              </div>
            )}
          </div>
          <div className="flex justify-between text-[12px] text-muted-foreground tabular-nums">
            <span>sobra {lazer ? formatBRLShort(lazer.remaining) : "–"}</span>
            <span>sobra {mercado ? formatBRLShort(mercado.remaining) : "–"}</span>
          </div>
        </div>
      )}

      {isCurrent && allWeekends.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-muted/70 p-3.5">
          <p className="text-[13px] leading-snug">
            <span className="font-semibold tabular-nums">
              {status.perWeekend ? formatBRLShort(status.perWeekend.total) : "–"}
            </span>{" "}
            <span className="text-muted-foreground">por fim de semana</span>
            {status.perWeekend && (
              <span className="block text-[12px] text-muted-foreground">
                {labels.lazer.toLowerCase()} {formatBRLShort(status.perWeekend.byBucket.lazer ?? 0)}, {labels.mercado.toLowerCase()}{" "}
                {formatBRLShort(status.perWeekend.byBucket.mercado ?? 0)}
              </span>
            )}
          </p>
          <WeekendChips all={allWeekends} skipped={skipped} />
        </div>
      )}

      <div className="flex min-h-0 flex-col">
        <p className="mb-1 text-[13px] font-semibold">Gastos do mês</p>
        <div className="fade-bottom overflow-y-auto pb-4 [scrollbar-width:none]" style={{ maxHeight: 208 }}>
          <TransactionList items={items} />
        </div>
      </div>
    </Panel>
  );
}
