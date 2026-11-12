"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { formatDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBucketLabels } from "@/components/labels-provider";

type Bucket = "lazer" | "mercado" | "fixo" | "assinatura" | "parcela" | "ignorar";

const OPTIONS: { value: Bucket; label: string; cls: string }[] = [
  { value: "lazer", label: "Lazer", cls: "bg-primary/10 text-primary" },
  { value: "mercado", label: "Mercado", cls: "bg-mercado/10 text-mercado" },
  { value: "fixo", label: "Fixo", cls: "bg-muted text-foreground" },
  { value: "assinatura", label: "Assin.", cls: "bg-muted text-foreground" },
  { value: "parcela", label: "Parcela", cls: "bg-muted text-foreground" },
  { value: "ignorar", label: "Ignorar", cls: "bg-muted text-muted-foreground" },
];

export interface TriageItem {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  method: string;
  account: string | null;
  /** Lançamento manual parecido (mesmo dia ±3, mesmo tipo): provavelmente o mesmo gasto. */
  duplicateOf?: { id: string; description: string; amount_cents: number; occurred_on: string } | null;
}

/** Sugestão de padrão para regra: primeira palavra "significativa" da descrição. */
function suggestPattern(desc: string) {
  const words = desc
    .toUpperCase()
    .replace(/[^A-Z0-9À-Ú ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["PIX", "COMPRA", "PAG", "PAGAMENTO", "DEBITO", "CARTAO", "PARC"].includes(w));
  return words[0] ?? desc.slice(0, 12);
}

export function TriageList({ items }: { items: TriageItem[] }) {
  const labels = useBucketLabels();
  const options = OPTIONS.map((o) => (o.value === "lazer" || o.value === "mercado" ? { ...o, label: labels[o.value] } : o));
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ruleFor, setRuleFor] = useState<{ id: string; pattern: string; bucket: Bucket } | null>(null);
  const [, startTransition] = useTransition();

  async function classify(item: TriageItem, bucket: Bucket) {
    setDone((s) => new Set(s).add(item.id));
    const res = await fetch(`/api/transactions/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket }),
    });
    if (!res.ok) {
      toast.error("Não foi possível salvar");
      setDone((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      return;
    }
    setRuleFor({ id: item.id, pattern: suggestPattern(item.description), bucket });
    startTransition(() => router.refresh());
  }

  async function merge(item: TriageItem) {
    if (!item.duplicateOf) return;
    setDone((s) => new Set(s).add(item.id));
    const res = await fetch("/api/transactions/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manualId: item.duplicateOf.id, bankId: item.id }),
    });
    if (!res.ok) toast.error("Não foi possível juntar");
    else toast.success(`Juntado com “${item.duplicateOf.description}”`);
    startTransition(() => router.refresh());
  }

  async function createRule() {
    if (!ruleFor) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pattern: ruleFor.pattern, bucket: ruleFor.bucket }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? "Erro");
    else toast.success(`Regra criada${data.applied ? ` e aplicada em ${data.applied}` : ""}.`);
    setRuleFor(null);
    router.refresh();
  }

  const visible = items.filter((i) => !done.has(i.id));

  return (
    <div className="flex flex-col gap-3">
      {ruleFor && (
        <div className="flex flex-col gap-2 rounded-2xl bg-primary/10 p-3 text-sm sm:flex-row sm:items-center">
          <Wand2 className="hidden size-4 text-primary sm:block" />
          <span className="flex-1">
            Sempre que a descrição tiver{" "}
            <input
              value={ruleFor.pattern}
              onChange={(e) => setRuleFor({ ...ruleFor, pattern: e.target.value })}
              className="w-32 rounded-md border border-input bg-card px-2 py-0.5 font-mono text-xs"
              aria-label="Padrão da regra"
            />{" "}
            → <b>{options.find((o) => o.value === ruleFor.bucket)?.label}</b>?
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={createRule} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Criar regra
            </button>
            <button type="button" onClick={() => setRuleFor(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
              Agora não
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tudo classificado. 🎉</p>}

      <ul className="flex flex-col gap-2">
        {visible.map((t) => (
          <li key={t.id} className="flex flex-col gap-2.5 surface rounded-[18px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDay(t.occurred_on)} · {t.method === "credito" ? "Crédito" : t.method === "pix" ? "Pix" : "Débito"}
                  {t.account ? ` · ${t.account}` : ""}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatBRL(t.amount_cents)}</span>
            </div>
            {t.duplicateOf && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-warning/15 px-3 py-2 text-xs">
                <span>
                  Parece o seu lançamento <b>“{t.duplicateOf.description}”</b> ({formatDay(t.duplicateOf.occurred_on)},{" "}
                  {formatBRL(t.duplicateOf.amount_cents)})
                </span>
                <button
                  type="button"
                  onClick={() => merge(t)}
                  className="shrink-0 rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background"
                >
                  É o mesmo
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => classify(t, o.value)}
                  className={cn("rounded-lg py-2 text-xs font-medium transition-transform active:scale-95", o.cls)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
