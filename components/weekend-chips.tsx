"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addDays, formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Fins de semana restantes; tocar marca/desmarca "sem gasto" e o ritmo se ajusta. */
export function WeekendChips({ all, skipped }: { all: string[]; skipped: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(saturday: string) {
    setBusy(saturday);
    const res = await fetch("/api/budgets/skip-weekend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saturday }),
    });
    setBusy(null);
    if (!res.ok) toast.error("Não foi possível atualizar");
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {all.map((sat) => {
        const off = skipped.includes(sat);
        return (
          <button
            key={sat}
            type="button"
            disabled={busy === sat}
            onClick={() => toggle(sat)}
            aria-pressed={!off}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium tabular-nums transition-colors",
              off
                ? "bg-transparent text-muted-foreground line-through ring-1 ring-border"
                : "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-primary/35 hover:ring-primary/60",
            )}
          >
            {formatDay(addDays(sat, -1))}–{formatDay(addDays(sat, 1))}
            {off && <span className="sr-only"> (sem gasto)</span>}
          </button>
        );
      })}
    </div>
  );
}
