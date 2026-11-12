// Validações compartilhadas pelas rotas de API.
import { addMonths } from "./dates";

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(v);

export function cents(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : null;
}

export function text(v: unknown, max = 60): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

/** Meses a partir de `month` (inclusive), `count` vezes, limitado a 1..36. */
export function monthsFrom(month: string, count: unknown): string[] {
  const n = Math.min(Math.max(Number.parseInt(String(count ?? 1), 10) || 1, 1), 36);
  return Array.from({ length: n }, (_, i) => addMonths(month, i));
}

export const INCOME_KINDS = ["salario", "13o", "freela", "outro"] as const;
export const FIXED_CATEGORIES = ["cartao", "emprestimo", "veiculo", "conta"] as const;
