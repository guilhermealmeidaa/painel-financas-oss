"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBucketLabels } from "@/components/labels-provider";
import type { Enums } from "@/lib/database.types";

const CHOICES = ["lazer", "mercado", "fixo", "assinatura", "parcela", "ignorar"] as const;

export function RulesEditor({ rules }: { rules: { id: string; pattern: string; bucket: Enums<"bucket"> }[] }) {
  const labels = useBucketLabels();
  const router = useRouter();
  const [pattern, setPattern] = useState("");
  const [bucket, setBucket] = useState<(typeof CHOICES)[number]>("lazer");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pattern, bucket }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Erro");
    toast.success(`Regra salva${data.applied ? `, ${data.applied} classificadas` : ""}.`);
    setPattern("");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Não foi possível apagar");
    router.refresh();
  }

  async function applyAll() {
    const res = await fetch("/api/rules/apply", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    toast.success(`${data.applied ?? 0} transações classificadas.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder='Descrição contém… (ex.: "CLAUDE")' className="h-10" />
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as (typeof CHOICES)[number])}
          className="h-10 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          aria-label="Bucket"
        >
          {CHOICES.map((c) => (
            <option key={c} value={c}>
              {labels[c]}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pattern.trim().length < 2} className="col-span-2 h-10 sm:col-span-1">
          Adicionar regra
        </Button>
      </form>

      {rules.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                contém <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.pattern}</code> → <b>{labels[r.bucket]}</b>
              </span>
              <button type="button" onClick={() => remove(r.id)} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Apagar regra ${r.pattern}`}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma regra ainda. Crie na hora de classificar ou aqui.</p>
      )}
      {rules.length > 0 && (
        <button type="button" onClick={applyAll} className="self-start text-xs text-primary hover:underline">
          Reaplicar regras nas sem categoria
        </button>
      )}
    </div>
  );
}
