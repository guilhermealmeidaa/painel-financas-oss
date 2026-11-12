import { BankLogo, bankFor } from "@/components/bank-logo";
import { cardStyle } from "@/lib/banks";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Chip do cartão desenhado em SVG (contatos dourados). */
function Chip({ light }: { light: boolean }) {
  return (
    <svg viewBox="0 0 36 28" className="h-[26px] w-[34px]" aria-hidden>
      <defs>
        <linearGradient id={light ? "chip-l" : "chip-d"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light ? "#d8b86a" : "#f4dc9a"} />
          <stop offset="1" stopColor={light ? "#b8923e" : "#c9a14e"} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="35" height="27" rx="5" fill={light ? "url(#chip-l)" : "url(#chip-d)"} />
      <path d="M12 0.5v27M24 0.5v27M0.5 10h11.5M24 10h11.5M0.5 18h11.5M24 18h11.5M12 14h12" stroke="rgb(0 0 0 / .22)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function Contactless() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" />
    </svg>
  );
}

/** "Cartão" visual com a cor do banco, nome, mês de vencimento e valor da fatura. */
export function CardTile({
  name,
  dueLabel,
  cents,
  badge,
  className,
}: {
  name: string;
  dueLabel: string;
  cents: number;
  badge?: string;
  className?: string;
}) {
  const s = cardStyle(name);
  const light = s.fg !== "#fff";
  return (
    <div
      className={cn(
        "relative flex aspect-[1.58] flex-col justify-between overflow-hidden rounded-[18px] p-4 shadow-[0_10px_24px_-12px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.18)]",
        className,
      )}
      style={{ background: s.bg, color: s.fg }}
    >
      {/* brilho diagonal e textura sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "linear-gradient(115deg, transparent 30%, rgb(255 255 255 / .16) 45%, transparent 60%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[.07] mix-blend-overlay"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        {bankFor(name) ? (
          <BankLogo name={name} className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.15)]" />
        ) : (
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
        )}
        {badge && (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", light ? "bg-black/8" : "bg-white/20 backdrop-blur-sm")}>
            {badge}
          </span>
        )}
      </div>
      <div className="relative flex items-center justify-between">
        <Chip light={light} />
        <Contactless />
      </div>
      <div className="relative flex items-end justify-between gap-2">
        <div>
          <p className="text-[9.5px] font-medium tracking-[0.14em] uppercase opacity-65">Vence</p>
          <p className="text-[13px] font-semibold">{dueLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[9.5px] font-medium tracking-[0.14em] uppercase opacity-65">Fatura</p>
          <p className="text-[14px] font-semibold tabular-nums">{formatBRL(cents)}</p>
        </div>
      </div>
    </div>
  );
}
