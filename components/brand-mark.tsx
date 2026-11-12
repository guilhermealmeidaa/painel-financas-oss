import { cn } from "@/lib/utils";

/** Marca do painel: duas barras de saldo subindo, em azul. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.45_0.2_265)] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="currentColor">
        <rect x="3.5" y="10" width="3.5" height="6.5" rx="1.2" opacity=".6" />
        <rect x="8.25" y="6.5" width="3.5" height="10" rx="1.2" opacity=".8" />
        <rect x="13" y="3.5" width="3.5" height="13" rx="1.2" />
      </svg>
    </div>
  );
}
