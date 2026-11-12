import { BANK_ICON_PATHS } from "@/lib/bank-icons";
import { bankFor } from "@/lib/banks";
import { cn } from "@/lib/utils";

export { bankFor };

/**
 * Logo do banco no cartão visual, pelo nome da conta (ver lib/banks.ts).
 * Com símbolo livre (Simple Icons): símbolo + nome; sem: o nome escrito no estilo da marca.
 * Banco não reconhecido: null (o cartão mostra o próprio nome).
 */
export function BankLogo({ name, className }: { name: string | null; className?: string }) {
  const bank = bankFor(name);
  if (!bank) return null;
  if (bank.icon) {
    const path = BANK_ICON_PATHS[bank.icon];
    const onlySymbol = bank.id === "nubank";
    return (
      <span className={cn("flex items-center gap-1.5", className)} aria-label={bank.name} role="img">
        <svg viewBox="0 0 24 24" className={onlySymbol ? "size-6" : "size-[22px]"} fill="currentColor" aria-hidden>
          <path d={path} />
        </svg>
        {!onlySymbol && <span className="text-[13px] leading-none font-bold tracking-[-0.01em]">{bank.name}</span>}
      </span>
    );
  }
  const w = bank.wordmark!;
  return (
    <span className={cn("leading-none", w.className, className)} aria-label={bank.name} role="img">
      {w.text}
    </span>
  );
}
