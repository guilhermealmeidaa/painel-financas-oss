"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export interface LinkCandidate {
  id: string;
  name: string;
  limit: number | null;
  available: number | null;
  closing_day: number | null;
  due_day: number | null;
  days_source: string | null;
  recent: { occurred_on: string; description: string; amount_cents: number }[];
}

async function patch(id: string, body: object) {
  const res = await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erro");
}

/**
 * Onboarding: "Este cartão do banco é qual dos seus?" com limite, vencimento e últimas compras
 * para reconhecer. Ao ligar, a estimativa daquele cartão some e passa a valer o banco.
 */
export function CardLinker({ bankCards, targets }: { bankCards: LinkCandidate[]; targets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function link(c: LinkCandidate) {
    const into = choice[c.id];
    if (!into) return;
    setBusy(c.id);
    try {
      await patch(c.id, { mergeInto: into });
      toast.success(`Ligado: agora “${targets.find((t) => t.id === into)?.name}” usa os dados do banco`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {bankCards.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <b className="truncate">{c.name.trim()}</b>
            <span className="text-xs text-muted-foreground tabular-nums">
              {c.limit != null ? `limite ${formatBRL(c.limit)}` : ""}
              {c.due_day ? ` · vence dia ${c.due_day}` : ""}
              {c.closing_day ? ` · fecha dia ${c.closing_day}` : ""}
            </span>
          </div>
          {c.recent.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {c.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {formatDay(r.occurred_on)} · {r.description}
                  </span>
                  <span className="tabular-nums">{formatBRL(r.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <select
              value={choice[c.id] ?? ""}
              onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })}
              className="h-9 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
              aria-label={`Qual dos seus cartões é ${c.name}`}
            >
              <option value="">Este cartão é o meu…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" className="h-9" disabled={!choice[c.id] || busy === c.id} onClick={() => link(c)}>
              Ligar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Dias de fechamento/vencimento de um cartão: mostra o que o banco indicou e deixa você corrigir. */
export function CardDays({ id, closing, due, source }: { id: string; closing: number | null; due: number | null; source: string | null }) {
  const router = useRouter();
  const [c, setC] = useState(closing ? String(closing) : "");
  const [d, setD] = useState(due ? String(due) : "");
  const dirty = c !== (closing ? String(closing) : "") || d !== (due ? String(due) : "");
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      fecha
      <input value={c} onChange={(e) => setC(e.target.value)} inputMode="numeric" className="h-7 w-10 rounded-md border border-input bg-card text-center" aria-label="Dia de fechamento" />
      vence
      <input value={d} onChange={(e) => setD(e.target.value)} inputMode="numeric" className="h-7 w-10 rounded-md border border-input bg-card text-center" aria-label="Dia de vencimento" />
      {dirty ? (
        <button
          type="button"
          className="rounded-md bg-primary px-2 py-1 text-primary-foreground"
          onClick={async () => {
            try {
              await patch(id, { closing_day: Number(c), due_day: Number(d) });
              toast.success("Dias salvos");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          salvar
        </button>
      ) : (
        <span>{source === "usuario" ? "(você)" : source === "banco" ? "(pelo banco)" : "(não informado)"}</span>
      )}
    </div>
  );
}
