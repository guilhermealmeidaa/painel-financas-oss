import { CopyCheck, TrendingUp, Sparkles } from "lucide-react";
import type { Anomaly } from "@/lib/anomalies";
import { formatDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

const ICON = { acima_do_normal: TrendingUp, cobranca_repetida: CopyCheck, primeira_vez_alta: Sparkles } as const;
const TITLE = { acima_do_normal: "Acima do normal", cobranca_repetida: "Cobrança repetida?", primeira_vez_alta: "Primeira vez, valor alto" } as const;

/** Lista de gastos fora do padrão, com o motivo. Só informa: nada é mudado. */
export function AnomaliesList({ items, accounts }: { items: Anomaly[]; accounts: Map<string, string> }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nada fora do padrão nos últimos 30 dias.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((a) => {
        const Icon = ICON[a.kind];
        return (
          <li key={`${a.kind}-${a.tx.id}`} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words">{a.tx.description}</p>
              <p className="text-xs text-muted-foreground">
                {TITLE[a.kind]} · {formatDay(a.tx.occurred_on)}
                {a.tx.account_id && accounts.get(a.tx.account_id) ? ` · ${accounts.get(a.tx.account_id)}` : ""} · {a.reason}
              </p>
            </div>
            <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{formatBRL(a.tx.amount_cents)}</span>
          </li>
        );
      })}
    </ul>
  );
}
