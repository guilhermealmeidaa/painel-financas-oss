"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export interface Suggestion {
  manual: { id: string; description: string; occurred_on: string; amount_cents: number };
  bank: { id: string; description: string; occurred_on: string; amount_cents: number }[];
  sum: number;
}

/** "Isso é o seu 'Jantar de sexta'?" — juntar 1 lançamento seu com N compras do banco. */
export function MergeSuggestions({ items }: { items: Suggestion[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  async function merge(s: Suggestion) {
    setDone((d) => new Set(d).add(s.manual.id));
    const res = await fetch("/api/transactions/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manualId: s.manual.id, bankIds: s.bank.map((b) => b.id) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? "Não foi possível juntar");
    else toast.success(`Juntado: “${s.manual.description}” agora vale ${formatBRL(s.sum)} (valor do banco)`);
    start(() => router.refresh());
  }

  const visible = items.filter((s) => !done.has(s.manual.id));
  if (!visible.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((s) => (
        <li key={s.manual.id} className="flex flex-col gap-2 rounded-2xl bg-warning/15 p-3 text-sm">
          <p>
            Isso é a sua <b>“{s.manual.description}”</b> ({formatDay(s.manual.occurred_on)}, {formatBRL(s.manual.amount_cents)})?
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {s.bank.map((b) => (
              <li key={b.id} className="flex justify-between gap-3">
                <span className="truncate">
                  {formatDay(b.occurred_on)} · {b.description}
                </span>
                <span className="tabular-nums">{formatBRL(b.amount_cents)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-border pt-0.5 font-medium text-foreground">
              <span>Soma do banco</span>
              <span className="tabular-nums">{formatBRL(s.sum)}</span>
            </li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => merge(s)} className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background">
              <Link2 className="size-3.5" /> É isso, juntar
            </button>
            <button type="button" onClick={() => setDone((d) => new Set(d).add(s.manual.id))} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
              Não é
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface BankIncome {
  id: string;
  month: string;
  description: string;
  amount_cents: number;
  kind: string;
}

/** Entradas que vieram do banco: confirmar ou dizer que não é entrada (estorno, dinheiro devolvido…). */
export function IncomesReview({ items }: { items: BankIncome[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  async function decide(i: BankIncome, status: "confirmada" | "rejeitada") {
    setDone((d) => new Set(d).add(i.id));
    const res = await fetch(`/api/incomes/${i.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) toast.error("Não foi possível salvar");
    start(() => router.refresh());
  }

  const visible = items.filter((i) => !done.has(i.id));
  if (!visible.length) return <p className="text-sm text-muted-foreground">Nenhuma entrada do banco esperando confirmação.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {visible.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate">{i.description}</p>
            <p className="text-xs text-muted-foreground">
              {i.kind === "salario" ? "Salário" : "Entrada extra"} · {i.month.slice(5, 7)}/{i.month.slice(0, 4)} · já conta na projeção
            </p>
          </div>
          <span className="font-medium tabular-nums text-positive">{formatBRL(i.amount_cents)}</span>
          <button type="button" onClick={() => decide(i, "confirmada")} className="rounded-lg bg-positive/15 px-2.5 py-1.5 text-xs font-medium text-positive">
            Confirmar
          </button>
          <button type="button" onClick={() => decide(i, "rejeitada")} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            Não é entrada
          </button>
        </li>
      ))}
    </ul>
  );
}
