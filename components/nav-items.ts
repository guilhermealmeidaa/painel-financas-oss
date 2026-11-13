import { Bell, Rocket, Bot, CalendarCog, CalendarDays, CalendarRange, CreditCard, FileText, Flag, HeartPulse, History, Inbox, LayoutGrid, Layers, Landmark, Menu, Repeat } from "lucide-react";

/** Menu principal (sidebar no desktop). */
export const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: LayoutGrid },
  { href: "/planejamento", label: "Planejamento", icon: CalendarCog },
  { href: "/projecao", label: "Projeção", icon: CalendarRange },
  { href: "/plano", label: "Plano", icon: Flag },
  { href: "/faturas", label: "Cartões", icon: CreditCard },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/parcelas", label: "Parcelas", icon: Layers },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/assinaturas", label: "Assinaturas", icon: Repeat },
  { href: "/relatorio", label: "Relatório", icon: FileText },
] as const;

export const OPEN_FINANCE_ITEMS = [
  { href: "/primeiros-passos", label: "Primeiros passos", icon: Rocket },
  { href: "/triagem", label: "Triagem", icon: Inbox },
  { href: "/conexoes", label: "Conexões", icon: Landmark },
  { href: "/acesso-claude", label: "Acesso do Claude", icon: Bot },
  { href: "/saude-dos-dados", label: "Saúde dos dados", icon: HeartPulse },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
] as const;

/** Barra de baixo do celular (5 itens). O resto fica em "Mais". */
export const MOBILE_ITEMS = [
  { href: "/", label: "Início", icon: LayoutGrid },
  { href: "/planejamento", label: "Planejar", icon: CalendarCog },
  { href: "/projecao", label: "Projeção", icon: CalendarRange },
  { href: "/faturas", label: "Cartões", icon: CreditCard },
  { href: "/mais", label: "Mais", icon: Menu },
] as const;

/** Páginas que ficam dentro de "Mais" no celular (para destacar a aba). */
export const MORE_PATHS = ["/mais", "/primeiros-passos", "/plano", "/notificacoes", "/calendario", "/parcelas", "/historico", "/assinaturas", "/relatorio", "/triagem", "/conexoes", "/acesso-claude", "/saude-dos-dados"];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/mais") return MORE_PATHS.some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}
