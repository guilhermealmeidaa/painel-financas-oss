"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_ITEMS, isActive } from "@/components/nav-items";
import { DEMO, DEMO_PAGES } from "@/lib/demo-flag";
import { cn } from "@/lib/utils";

/** Barra flutuante do celular: pílula com a aba ativa em destaque. O "+" fica ao lado (AddEntry). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação"
      className="print:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-[5.25rem] z-30 rounded-full bg-nav p-1.5 shadow-lg ring-1 ring-border backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-flow-col auto-cols-fr">
        {MOBILE_ITEMS.filter((i) => !DEMO || DEMO_PAGES.includes(i.href)).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] transition-colors",
                  active ? "bg-nav-active text-nav-active-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
