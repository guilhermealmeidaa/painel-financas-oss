"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDay } from "@/lib/dates";
import { METHOD_LABEL } from "@/lib/labels";
import { useBucketLabels } from "@/components/labels-provider";
import { formatBRL } from "@/lib/money";
import type { Enums } from "@/lib/database.types";

export interface TxItem {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  bucket: Enums<"bucket">;
  method: Enums<"payment_method">;
  source: Enums<"tx_source">;
}

export function TransactionList({ items }: { items: TxItem[] }) {
  const labels = useBucketLabels();
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setConfirming(null);
    if (!res.ok) toast.error("Não foi possível apagar");
    else {
      toast.success("Lançamento apagado");
      router.refresh();
    }
  }

  if (!items.length) return <p className="text-sm text-muted-foreground">Nenhum gasto neste mês.</p>;

  return (
    <ul className="divide-y divide-border/70">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          <span className="w-10 shrink-0 text-[12px] font-medium text-muted-foreground tabular-nums">{formatDay(t.occurred_on)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{t.description}</p>
            <p className="text-[12px] text-muted-foreground">
              {labels[t.bucket]} · {METHOD_LABEL[t.method]}
            </p>
          </div>
          <span className="text-[13.5px] font-semibold tabular-nums">{formatBRL(t.amount_cents)}</span>
          {t.source === "manual" &&
            (confirming === t.id ? (
              <button type="button" onClick={() => remove(t.id)} className="rounded-md bg-destructive/20 px-2 py-1 text-xs text-destructive">
                Apagar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(t.id)}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label={`Apagar ${t.description}`}
              >
                <Trash2 className="size-4" />
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}
