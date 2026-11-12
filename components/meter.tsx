import { cn } from "@/lib/utils";

/** Barra de progresso de gasto. Passou do teto: fica vermelha e cheia. */
export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  const over = value > max;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", over ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
