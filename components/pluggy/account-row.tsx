"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  id: string;
  name: string;
  kind: "credit_card" | "checking";
  info: string;
  /** Contas cadastradas por você, ainda sem banco, do mesmo tipo (ex.: Nubank, Inter). */
  targets: { id: string; name: string }[];
  txCount: number;
  children?: React.ReactNode;
}

/** Linha de uma conta vinda do banco: renomear ou dizer "isto é o meu Nubank". */
export function AccountRow({ id, name, kind, info, targets, txCount, children }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(name.trim());
  const [busy, setBusy] = useState(false);

  async function patch(body: object, ok: string) {
    setBusy(true);
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(data.error ?? "Erro");
    toast.success(ok);
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          aria-label="Nome da conta"
          maxLength={60}
        />
        {value.trim() && value.trim() !== name.trim() && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ name: value.trim() }, "Renomeado")}
            className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"
            aria-label="Salvar nome"
          >
            <Check className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-xs text-muted-foreground tabular-nums">
          {kind === "credit_card" ? "cartão" : "conta"} · {txCount} transações{info ? ` · ${info}` : ""}
        </span>
        {targets.length > 0 && (
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const target = targets.find((t) => t.id === e.target.value);
              if (target) patch({ mergeInto: target.id }, `Agora é o ${target.name}`);
            }}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30"
            aria-label="Juntar com conta cadastrada"
          >
            <option value="">É o meu…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {children && <div className="w-full sm:basis-full">{children}</div>}
    </li>
  );
}
