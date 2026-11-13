export interface CategoryTotal {
  label: string;
  cents: number;
}

export interface CategoryDelta {
  label: string;
  cur: number;
  prev: number;
  diff: number;
  /** variação em %, arredondada; null quando não houve gasto no mês anterior */
  pct: number | null;
}

/** Variação por categoria entre dois períodos (mesma janela de dias). Ordena pela maior diferença absoluta. */
export function compareCategories(cur: CategoryTotal[], prev: CategoryTotal[]): CategoryDelta[] {
  const labels = new Set([...cur.map((c) => c.label), ...prev.map((p) => p.label)]);
  const get = (list: CategoryTotal[], l: string) => list.find((x) => x.label === l)?.cents ?? 0;
  return [...labels]
    .map((label) => {
      const c = get(cur, label);
      const p = get(prev, label);
      return { label, cur: c, prev: p, diff: c - p, pct: p > 0 ? Math.round(((c - p) / p) * 100) : null };
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** "+40%", "−15%", "novo" ou "igual" (variação pequena: menos de R$ 5 ou de 5%). */
export function deltaLabel(d: CategoryDelta): string {
  if (Math.abs(d.diff) < 500 || (d.pct != null && Math.abs(d.pct) < 5)) return "igual";
  if (d.pct == null) return "novo";
  return `${d.pct > 0 ? "+" : "−"}${Math.abs(d.pct)}%`;
}
