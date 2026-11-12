"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QuickAdd } from "@/components/quick-add";

/**
 * Botão "+" do painel: FAB redondo no celular (ao lado da barra flutuante)
 * e botão "Adicionar" fixo no canto superior direito no desktop.
 */
export function AddDialog(props: {
  today: string;
  defaultMethod: "credito" | "debito" | "pix";
  cards: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Adicionar gasto"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 lg:absolute lg:top-7 lg:right-[max(1.75rem,calc((100vw-1440px)/2+1.75rem))] lg:bottom-auto lg:flex lg:h-10 lg:w-auto lg:items-center lg:gap-1.5 lg:rounded-xl lg:px-4 lg:text-[13px] lg:font-semibold lg:shadow-[0_1px_2px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.15)] lg:hover:bg-primary/90"
      >
        <Plus className="size-7 lg:size-4" />
        <span className="hidden lg:inline">Adicionar</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar gasto</DialogTitle>
          <DialogDescription>Entra no dia a dia do mês da data escolhida.</DialogDescription>
        </DialogHeader>
        <QuickAdd {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
