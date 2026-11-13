import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selo do canto do card: ícone fino sobre um quadrado com degradê suave da cor do card.
 * Faz o papel das ilustrações da referência sem depender de imagem.
 */
export function IconBadge({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/16 to-primary/4 text-primary ring-1 ring-primary/10 ring-inset",
        className,
      )}
      aria-hidden
    >
      <div className="absolute -top-3 -right-3 size-8 rounded-full bg-white/50 blur-md dark:bg-white/10" />
      <Icon className="relative size-[22px]" strokeWidth={1.6} />
    </div>
  );
}

/** Card do painel: título discreto, selo opcional no canto e conteúdo. */
export function Panel({
  title,
  subtitle,
  icon,
  iconClass,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconClass?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("surface flex flex-col gap-5 p-5 sm:p-6", className)}>
      {(title || icon || action) && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-0.5">
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {icon && <IconBadge icon={icon} className={cn(action && "hidden sm:grid", iconClass)} />}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

/** Rótulo pequeno acima de um valor ("Fatura de dezembro"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[12.5px] text-muted-foreground", className)}>{children}</p>;
}
