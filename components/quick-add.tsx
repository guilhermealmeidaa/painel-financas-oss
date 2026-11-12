"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBucketLabels } from "@/components/labels-provider";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Bucket = "lazer" | "mercado";
type Method = "credito" | "debito" | "pix";

const chip = (active: boolean) =>
  cn(
    "h-10 flex-1 rounded-xl border text-sm transition-colors",
    active ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:text-foreground",
  );

export function QuickAdd({
  today,
  defaultMethod,
  cards,
  onDone,
}: {
  onDone?: () => void;
  today: string;
  defaultMethod: Method;
  cards: { id: string; name: string }[];
}) {
  const labels = useBucketLabels();
  const router = useRouter();
  const amountRef = useRef<HTMLInputElement>(null);
  const [bucket, setBucket] = useState<Bucket>("lazer");
  const [method, setMethod] = useState<Method>(defaultMethod);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const cents = parseBRLToCents(String(form.get("amount")));
    if (!cents) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount_cents: cents,
        description: form.get("description"),
        occurred_on: form.get("date"),
        account_id: method === "credito" ? form.get("account") || null : null,
        bucket,
        method,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      toast.error(error);
      return;
    }
    toast.success(`${formatBRL(cents)} lançado`);
    formEl.reset();
    amountRef.current?.focus();
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            required
            className="h-11 text-lg tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" name="description" placeholder="Ex.: pizza" required maxLength={120} className="h-11" />
        </div>
      </div>

      <fieldset className="flex gap-2">
        <legend className="sr-only">Bucket</legend>
        <button type="button" className={chip(bucket === "lazer")} onClick={() => setBucket("lazer")} aria-pressed={bucket === "lazer"}>
          {labels.lazer}
        </button>
        <button type="button" className={chip(bucket === "mercado")} onClick={() => setBucket("mercado")} aria-pressed={bucket === "mercado"}>
          {labels.mercado}
        </button>
      </fieldset>

      <fieldset className="flex gap-2">
        <legend className="sr-only">Meio de pagamento</legend>
        {(["pix", "debito", "credito"] as const).map((m) => (
          <button key={m} type="button" className={chip(method === m)} onClick={() => setMethod(m)} aria-pressed={method === m}>
            {m === "pix" ? "Pix" : m === "debito" ? "Débito" : "Crédito"}
          </button>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Data</Label>
          <Input id="date" name="date" type="date" defaultValue={today} required className="h-11" />
        </div>
        {method === "credito" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account">Cartão</Label>
            <select
              id="account"
              name="account"
              defaultValue=""
              className="h-11 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">Não informado</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Button type="submit" disabled={saving} className="h-12 text-base">
        {saving ? "Salvando…" : "Lançar gasto"}
      </Button>
    </form>
  );
}
