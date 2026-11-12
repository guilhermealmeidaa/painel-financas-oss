"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Faixa horizontal de cartões com setas ‹ › (no computador não dá para arrastar com o mouse).
 * No celular continua deslizando com o dedo. A roda do mouse em cima da faixa também rola para o lado.
 */
export function CardCarousel({ leading, children, className }: { leading?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // roda vertical vira rolagem lateral enquanto ainda há cartão para ver
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const canLeft = el.scrollLeft > 0;
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      if ((e.deltaY > 0 && canRight) || (e.deltaY < 0 && canLeft)) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [update]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const w = card ? card.offsetWidth + 12 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  const arrow = (dir: 1 | -1, disabled: boolean) => (
    <button
      type="button"
      onClick={() => step(dir)}
      disabled={disabled}
      aria-label={dir < 0 ? "Cartão anterior" : "Próximo cartão"}
      className="grid size-8 place-items-center rounded-full text-foreground ring-1 ring-border transition-colors hover:bg-muted disabled:text-muted-foreground/40 disabled:ring-border/50 disabled:hover:bg-transparent"
    >
      {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div>{leading}</div>
        {!(edge.start && edge.end) && (
          <div className="flex items-center gap-1.5">
            {arrow(-1, edge.start)}
            {arrow(1, edge.end)}
          </div>
        )}
      </div>
      <div
        ref={ref}
        onScroll={update}
        tabIndex={0}
        aria-label="Cartões"
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {children}
      </div>
    </div>
  );
}
