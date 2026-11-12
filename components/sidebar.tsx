"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, SunMoon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, OPEN_FINANCE_ITEMS, isActive } from "@/components/nav-items";
import { DEMO, DEMO_PAGES } from "@/lib/demo-flag";
import { cn } from "@/lib/utils";

export function Sidebar({ email, triageCount }: { email: string; triageCount: number }) {
  const pathname = usePathname();
  const link = (href: string, label: string, Icon: (typeof NAV_ITEMS)[number]["icon"], badge?: number) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] transition-colors",
          active
            ? "bg-sidebar-accent font-semibold text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <Icon className={cn("size-[17px]", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")} strokeWidth={1.8} />
        <span className="flex-1">{label}</span>
        {badge ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10.5px] font-semibold text-white tabular-nums">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside className="surface sticky top-4 hidden h-[calc(100dvh-2rem)] w-[232px] shrink-0 flex-col p-3 lg:flex">
      <div className="flex items-center gap-2.5 px-2 pt-2 pb-6">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">Painel</p>
          <p className="text-[12px] text-muted-foreground">Finanças pessoais</p>
        </div>
      </div>

      <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-muted-foreground/80">Menu</p>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.filter((i) => !DEMO || DEMO_PAGES.includes(i.href)).map((i) => link(i.href, i.label, i.icon))}
      </nav>

      {!DEMO && (
        <>
          <p className="px-2.5 pt-6 pb-1.5 text-[11.5px] font-medium text-muted-foreground/80">Bancos e dados</p>
          <nav className="flex flex-col gap-0.5">
            {OPEN_FINANCE_ITEMS.map((i) => link(i.href, i.label, i.icon, i.href === "/triagem" ? triageCount : undefined))}
          </nav>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex h-10 items-center justify-between px-2.5">
          <span className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
            <SunMoon className="size-[17px]" strokeWidth={1.8} /> Tema
          </span>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-sidebar-accent/70 p-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-[13px] font-semibold text-primary ring-1 ring-border">
            {email.slice(0, 1).toUpperCase() || "V"}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">{email.split("@")[0] || "Você"}</p>
            <p className="text-[11.5px] text-muted-foreground">Uso pessoal</p>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
