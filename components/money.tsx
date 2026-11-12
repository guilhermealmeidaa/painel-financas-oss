import { cn } from "@/lib/utils";

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Valor no estilo do painel: "R$" no mesmo corpo porém apagado, inteiro em destaque e centavos pequenos.
 * size: xl (hero), lg (card), md (linha).
 */
export function Money({
  cents,
  size = "lg",
  className,
  signed = false,
}: {
  cents: number;
  size?: "xl" | "lg" | "md";
  className?: string;
  signed?: boolean;
}) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const int = intFmt.format(Math.floor(abs / 100));
  const dec = String(abs % 100).padStart(2, "0");
  const big = { xl: "text-[44px] sm:text-[56px] leading-none", lg: "text-[30px] leading-none", md: "text-xl leading-none" }[size];
  const cur = { xl: "text-[34px] sm:text-[42px]", lg: "text-[24px]", md: "text-base" }[size];
  const small = { xl: "text-[22px] sm:text-[26px]", lg: "text-[15px]", md: "text-xs" }[size];
  return (
    <span className={cn("inline-flex items-baseline font-bold tracking-[-0.035em] tabular-nums", className)}>
      <span className={cn(cur, "mr-[0.18em] font-semibold text-muted-foreground/80")}>
        {neg ? "−" : signed ? "+" : ""}R$
      </span>
      <span className={big}>{int}</span>
      <span className={cn(small, "ml-px font-medium tracking-normal text-muted-foreground")}>,{dec}</span>
    </span>
  );
}
