/**
 * Modo demonstração: dados inventados, sem login, para mostrar o painel em prints.
 * Liga com NEXT_PUBLIC_DEMO_MODE=1 e SÓ em desenvolvimento (nunca no build de produção).
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

/** Únicas páginas do modo demonstração: todas leem só os dados inventados (loadAll). */
export const DEMO_PAGES = ["/", "/faturas", "/projecao", "/parcelas"];
