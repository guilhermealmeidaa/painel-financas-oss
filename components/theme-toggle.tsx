"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Seletor claro/escuro em pílula (sidebar e topo do celular). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- só para evitar diferença de hidratação
  useEffect(() => setMounted(true), []);
  const current = mounted ? resolvedTheme : undefined;

  const btn = (value: "light" | "dark", Icon: typeof Sun, label: string) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-label={label}
      aria-pressed={current === value}
      className={cn(
        "grid size-7 place-items-center rounded-full text-muted-foreground transition-colors",
        current === value && "bg-card text-foreground shadow-sm",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );

  return (
    <div className={cn("inline-flex rounded-full bg-muted p-0.5", className)}>
      {btn("light", Sun, "Tema claro")}
      {btn("dark", Moon, "Tema escuro")}
    </div>
  );
}
