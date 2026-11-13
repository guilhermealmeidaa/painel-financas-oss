import "server-only";
import { formatMonthLong } from "@/lib/dates";

/** Valor por extenso para a Siri ler bem: "R$ 500,00". */
export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const monthName = (iso: string) => formatMonthLong(`${iso.slice(0, 7)}-01`).split(" ")[0];
/** "14/11 e 28/11" */
export function weekendList(saturdays: string[]) {
  const d = saturdays.map((s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`);
  return d.length > 1 ? `${d.slice(0, -1).join(", ")} e ${d.at(-1)}` : (d[0] ?? "");
}

export function bearerOf(req: Request): string | undefined {
  const auth = req.headers.get("authorization") ?? "";
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : undefined;
}

/** Texto puro (o app Atalhos mostra/fala direto) ou JSON com ?formato=json. */
export function atalhoReply(req: Request, status: number, text: string, data: Record<string, unknown> = {}) {
  const json = new URL(req.url).searchParams.get("formato") === "json";
  return new Response(json ? JSON.stringify({ mensagem: text, ...data }) : text, {
    status,
    headers: { "content-type": json ? "application/json" : "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** "30", "30,50", "R$ 1.234,56", 30.5 → centavos. */
export function parseValor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const CATEGORIAS: Record<string, "lazer" | "mercado" | "fixo" | "assinatura"> = {
  lazer: "lazer",
  mercado: "mercado",
  fixo: "fixo",
  conta: "fixo",
  assinatura: "assinatura",
};
/** Categoria falada ("lazer", "Mercado") → bucket. Desconhecida = null (o padrão é lazer). */
export function parseCategoria(v: unknown, labels?: { label_lazer?: string | null; label_mercado?: string | null } | null) {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  // os nomes que você deu às duas categorias do dia a dia (Planejamento → Preferências) também valem
  if (labels?.label_lazer && k === labels.label_lazer.trim().toLowerCase()) return "lazer" as const;
  if (labels?.label_mercado && k === labels.label_mercado.trim().toLowerCase()) return "mercado" as const;
  return CATEGORIAS[k] ?? null;
}
