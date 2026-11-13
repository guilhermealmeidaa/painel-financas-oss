"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { reasonGroup, reasonLabel } from "@/lib/auto-reasons";
import { formatDay } from "@/lib/dates";
import { useBucketLabels } from "@/components/labels-provider";
import { formatBRL } from "@/lib/money";
import type { Enums } from "@/lib/database.types";

export interface AutoItem {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  bucket: Enums<"bucket">;
  auto_reason: string;
  fee_cents: number | null;
  account: string | null;
  linked: string | null;
  /** juntada a um lançamento seu: desfazer restaura o lançamento */
  manual_id?: string | null;
}

const GROUP_LABEL: Record<string, string> = {
  pix_no_credito: "Pix no crédito",
  pix_no_credito_taxa: "Compras de Pix no crédito",
  pagamento_fatura: "Pagamentos de fatura",
  transferencia_propria: "Transferências para você mesmo",
  regras: "Regras",
  categoria_banco: "Categoria do banco",
  iof_herdado: "IOF e juros",
  juntado_manual: "Juntados com seus lançamentos",
  parcela_da_serie: "Continuações de compras parceladas",
};

/** Tudo que o painel classificou sozinho, agrupado por motivo, com "Desfazer". */
export function AutoDecisions({ items }: { items: AutoItem[] }) {
  const labels = useBucketLabels();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  async function undo(t: AutoItem) {
    setGone((s) => new Set(s).add(t.id));
    const res = t.manual_id
      ? await fetch("/api/transactions/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ manualId: t.manual_id, undo: true }),
        })
      : await fetch(`/api/transactions/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ undo: true }),
        });
    if (!res.ok) toast.error("Não foi possível desfazer");
    else toast.success("Desfeito: agora é você quem decide esse item");
    start(() => router.refresh());
  }

  const groups = new Map<string, AutoItem[]>();
  for (const t of items.filter((i) => !gone.has(i.id))) {
    const g = reasonGroup(t.auto_reason);
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  if (!groups.size) return <p className="text-sm text-muted-foreground">Nenhuma decisão automática neste período.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {[...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([g, list]) => {
          const total = list.reduce((s, t) => s + t.amount_cents, 0);
          const isOpen = open === g;
          return (
            <li key={g} className="rounded-2xl bg-muted/60">
              <button type="button" onClick={() => setOpen(isOpen ? null : g)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className="flex-1 text-sm font-medium">
                  {GROUP_LABEL[g] ?? reasonLabel(g)} <span className="text-xs font-normal text-muted-foreground">({list.length})</span>
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">{formatBRL(total)}</span>
                <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t border-border px-3">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDay(t.occurred_on)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words">{t.description}</p>
                        <p className="text-xs break-words text-muted-foreground">
                          → {labels[t.bucket]} · {reasonLabel(t.auto_reason)}
                          {t.fee_cents ? ` · taxa ${formatBRL(t.fee_cents)}` : ""}
                          {t.linked ? ` · ligado a “${t.linked}”` : ""}
                          {t.account ? ` · ${t.account}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">{formatBRL(t.amount_cents)}</span>
                      <button type="button" onClick={() => undo(t)} className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Desfazer ${t.description}`}>
                        <Undo2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
    </ul>
  );
}
