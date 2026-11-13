"use client";

import { Download, Printer } from "lucide-react";

/** Imprimir/salvar em PDF (menu de impressão do navegador) e baixar as transações do mês em CSV. */
export function ReportActions({ month }: { month: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold ring-1 ring-border transition-colors hover:bg-muted"
      >
        <Printer className="size-4" /> Imprimir ou salvar PDF
      </button>
      <a
        href={`/api/export?mes=${month}`}
        className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold ring-1 ring-border transition-colors hover:bg-muted"
      >
        <Download className="size-4" /> Baixar CSV
      </a>
    </div>
  );
}
