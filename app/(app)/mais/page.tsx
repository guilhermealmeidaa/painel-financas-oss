import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { NAV_ITEMS, OPEN_FINANCE_ITEMS } from "@/components/nav-items";

const MOBILE_HIDDEN = ["/parcelas", "/historico", "/assinaturas"];

/** No celular, o que não cabe na barra de baixo. */
export default function MaisPage() {
  const groups = [
    { title: "Finanças", items: NAV_ITEMS.filter((i) => MOBILE_HIDDEN.includes(i.href)) },
    { title: "Integrações", items: OPEN_FINANCE_ITEMS },
  ];
  return (
    <>
      <PageHeader title="Mais" />
      {groups.map((g) => (
        <section key={g.title} className="surface p-2">
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{g.title}</p>
          <ul>
            {g.items.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-muted">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
