import Link from "next/link";
import { AlertTriangle, Car, Check, CreditCard, Gamepad2, Gift, Home, Landmark, Layers, Shirt } from "lucide-react";
import { Money } from "@/components/money";
import { Eyebrow, Panel } from "@/components/panel";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface CommitItem {
  name: string;
  cents: number;
  kind: "parcela" | "cartao" | "emprestimo" | "veiculo";
}

const REF = 30; // referência: até 30% da renda comprometida
const SCALE = 60; // barra vai até 60%

function iconFor(item: CommitItem) {
  const n = item.name.toLowerCase();
  if (item.kind === "veiculo") return Car;
  if (item.kind === "emprestimo") return Landmark;
  if (item.kind === "cartao") return CreditCard;
  if (n.includes("game") || n.includes("jogo") || n.includes("console")) return Gamepad2;
  if (n.includes("roupa")) return Shirt;
  if (n.includes("airbnb")) return Home;
  if (n.includes("presente")) return Gift;
  return Layers;
}

/** Quanto da renda do mês já sai comprometido com parcelas, cartões antigos, empréstimos e financiamentos. */
export function ParcelasCard({ items, income, className }: { items: CommitItem[]; income: number; className?: string }) {
  const total = items.reduce((s, i) => s + i.cents, 0);
  const pct = income > 0 ? (total / income) * 100 : 0;
  const ok = pct <= REF;

  return (
    <Panel title="Comprometido" icon={Layers} className={className}>
      <div>
        <Eyebrow>Parcelas, empréstimos e financiamentos no mês</Eyebrow>
        <Money cents={total} className="mt-1" />
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px]">
          {ok ? <Check className="size-3.5 text-positive" strokeWidth={2.5} /> : <AlertTriangle className="size-3.5 text-warning" strokeWidth={2.2} />}
          <span className={cn("font-semibold", ok ? "text-positive" : "text-warning")}>{Math.round(pct)}% da renda</span>
          <span className="text-muted-foreground">referência: até {REF}%</span>
        </p>
      </div>

      <div className="relative pt-5">
        <span className="absolute top-0 -translate-x-1/2 text-[11px] font-medium text-muted-foreground" style={{ left: `${(REF / SCALE) * 100}%` }}>
          {REF}%
        </span>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", ok ? "bg-positive" : "bg-warning")}
            style={{ width: `${Math.min(pct / SCALE, 1) * 100}%` }}
          />
        </div>
        <span className="absolute top-[14px] h-[22px] w-[2px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${(REF / SCALE) * 100}%` }} aria-hidden />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>0%</span>
          <span>{SCALE}% da renda</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
      <p className="text-[13px] font-semibold">O que entra na conta</p>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {items.map((i) => {
          const Icon = iconFor(i);
          return (
            <li key={i.name} className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary/8 text-primary ring-1 ring-primary/10 ring-inset">
                <Icon className="size-[17px]" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12px] text-muted-foreground">{i.name}</span>
                <span className="text-[13.5px] font-semibold tabular-nums">{formatBRL(i.cents)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      </div>
      <Link href="/parcelas" className="mt-auto self-start text-[12.5px] font-semibold text-primary hover:underline">
        Ver todas as parcelas
      </Link>
    </Panel>
  );
}
