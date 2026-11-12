import Link from "next/link";
import { Inbox, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

/** Topo do celular: nome do app, triagem (com contador), tema e sair. No desktop isso fica na sidebar. */
export function MobileTopBar({ triageCount = 0 }: { triageCount?: number }) {
  return (
    <header className="mb-3 flex items-center justify-between surface px-4 py-3 lg:hidden">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Painel</p>
          <p className="text-xs text-muted-foreground">Finanças pessoais</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Link
          href="/triagem"
          aria-label={`Triagem: ${triageCount} sem categoria`}
          className="relative grid size-10 place-items-center rounded-full text-muted-foreground ring-1 ring-border"
        >
          <Inbox className="size-[18px]" />
          {triageCount > 0 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
              {triageCount > 99 ? "99+" : triageCount}
            </span>
          )}
        </Link>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="rounded-full p-2 text-muted-foreground" aria-label="Sair">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
