/**
 * Junção de lançamentos manuais com transações do banco (puro).
 * Um manual pode corresponder a VÁRIAS compras do banco ("Jantar de sexta" 161 =
 * restaurante 146,55 + sorvete 23,22). A soma precisa ficar a ±15% do manual, mesmo tipo
 * (crédito com cartão; Pix/débito com conta) e no mesmo dia ou ±1 dia.
 */
export interface MergeTx {
  id: string;
  occurred_on: string;
  amount_cents: number;
  method: string;
  description: string;
}

export interface MergeSuggestion {
  manualId: string;
  bankIds: string[];
  sum: number;
  /** diferença relativa da soma em relação ao manual (0,05 = 5%) */
  diff: number;
  score: number;
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const sameKind = (a: string, b: string) => (a === "credito") === (b === "credito");
const MAX_ITEMS = 4;
const TOLERANCE = 0.15;
/** penalidade por item a mais e por item de outro dia (prefere soma exata e mesmo dia) */
const PER_ITEM = 0.02;
const OTHER_DAY = 0.08;

function bestFor(m: MergeTx, bank: MergeTx[]): MergeSuggestion | null {
  const cands = bank
    .filter((b) => sameKind(m.method, b.method) && Math.abs(day(b.occurred_on) - day(m.occurred_on)) <= 1)
    .filter((b) => b.amount_cents <= m.amount_cents * (1 + TOLERANCE))
    .slice(0, 14);
  let best: MergeSuggestion | null = null;
  const walk = (start: number, picked: MergeTx[], sum: number) => {
    if (picked.length) {
      const diff = Math.abs(sum - m.amount_cents) / Math.max(m.amount_cents, 1);
      if (diff <= TOLERANCE) {
        const otherDay = picked.filter((p) => p.occurred_on !== m.occurred_on).length;
        const score = diff + PER_ITEM * (picked.length - 1) + OTHER_DAY * otherDay;
        if (!best || score < best.score) best = { manualId: m.id, bankIds: picked.map((p) => p.id), sum, diff, score };
      }
    }
    if (picked.length === MAX_ITEMS) return;
    for (let i = start; i < cands.length; i++) {
      const next = sum + cands[i].amount_cents;
      if (next > m.amount_cents * (1 + TOLERANCE)) continue;
      walk(i + 1, [...picked, cands[i]], next);
    }
  };
  walk(0, [], 0);
  return best;
}

/**
 * Melhor combinação de 1 a 4 transações do banco para cada manual.
 * Escolhe um par por vez (o de melhor nota) e recalcula os outros com o que sobrou,
 * então cada transação do banco é usada uma vez só.
 */
export function suggestMerges(manual: MergeTx[], bank: MergeTx[]): MergeSuggestion[] {
  let pool = [...bank];
  let pending = [...manual];
  const out: MergeSuggestion[] = [];
  while (pending.length) {
    const options = pending.map((m) => bestFor(m, pool)).filter((s): s is MergeSuggestion => s != null);
    if (!options.length) break;
    options.sort((a, b) => a.score - b.score);
    const pick = options[0];
    out.push(pick);
    pool = pool.filter((b) => !pick.bankIds.includes(b.id));
    pending = pending.filter((m) => m.id !== pick.manualId);
  }
  return out;
}
