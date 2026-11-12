"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import type { Bill } from "@/lib/bills";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

type Filter = "todas" | "pendentes" | "pagas";

export function ContasCard({ month, monthLabel, bills, className }: { month: string; monthLabel: string; bills: Bill[]; className?: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("todas");
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(bills, (state, key: string) =>
    state.map((b) => (b.key === key ? { ...b, paid: !b.paid } : b)),
  );

  const pending = optimistic.filter((b) => !b.paid);
  const total = optimistic.reduce((s, b) => s + b.cents, 0);
  const pendingTotal = pending.reduce((s, b) => s + b.cents, 0);
  const shown = optimistic.filter((b) => (filter === "todas" ? true : filter === "pagas" ? b.paid : !b.paid));

  function toggle(b: Bill) {
    startTransition(async () => {
      setOptimistic(b.key);
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, key: b.key, paid: !b.paid }),
      });
      if (!res.ok) toast.error("Não foi possível salvar");
      router.refresh();
    });
  }

  return (
    <Panel
      title={<>Contas a pagar <span className="font-normal text-muted-foreground">em {monthLabel}</span></>}
      icon={CalendarCheck}
      className={className}
    >
      <div>
        <Money cents={total} />
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          <span className="font-medium text-foreground">{optimistic.length - pending.length} de {optimistic.length}</span> pagas
          {pending.length > 0 && <>, faltam <span className="font-medium text-foreground tabular-nums">{formatBRL(pendingTotal)}</span></>}
        </p>
      </div>

      <div className="grid grid-cols-3 rounded-[12px] bg-muted p-[3px] text-[13px] ring-1 ring-border/60 ring-inset" role="tablist">
        {(["todas", "pendentes", "pagas"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-[9px] py-1.5 capitalize text-muted-foreground transition-colors hover:text-foreground",
              filter === f && "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.03)]",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="fade-bottom -mx-1 -mb-2 flex max-h-[236px] flex-col overflow-y-auto pb-6 [scrollbar-width:none]">
        {shown.length === 0 && <li className="px-1 py-3 text-sm text-muted-foreground">Nada aqui.</li>}
        {shown.map((b) => (
          <li key={b.key} className="border-b border-border/70 last:border-0">
            <button
              type="button"
              onClick={() => toggle(b)}
              aria-pressed={b.paid}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-[11px] text-left transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                  b.paid ? "border-positive bg-positive text-white" : "border-muted-foreground/35",
                )}
              >
                {b.paid && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[13.5px] font-medium", b.paid && "font-normal text-muted-foreground line-through decoration-muted-foreground/40")}>{b.name}</span>
              <span className={cn("text-[13.5px] font-semibold tabular-nums", b.paid && "font-normal text-muted-foreground")}>
                {formatBRL(b.cents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
