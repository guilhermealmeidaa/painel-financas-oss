// Assinaturas a partir das transações marcadas como subtipo "assinatura" (puro).
import { norm } from "./engine";

export interface SubTx {
  occurred_on: string;
  description: string;
  amount_cents: number;
  account: string | null;
}

export interface Subscription {
  name: string;
  monthly_cents: number;
  last_on: string;
  account: string | null;
  charges: number;
}

/** Chave da assinatura: a regra que casou (ex.: "regra:MICROSOFT") ou o começo da descrição. */
export function subscriptionKey(description: string, autoReason: string | null): string {
  if (autoReason?.startsWith("regra:")) return autoReason.slice(6).toUpperCase();
  return norm(description).replace(/[^a-z ]/g, " ").split(" ").filter(Boolean).slice(0, 2).join(" ").toUpperCase();
}

/** Uma linha por assinatura: valor do último débito como mensal, data do último, cartão. */
export function groupSubscriptions(txs: (SubTx & { key: string })[]): { items: Subscription[]; total_cents: number } {
  const by = new Map<string, (SubTx & { key: string })[]>();
  for (const t of txs) by.set(t.key, [...(by.get(t.key) ?? []), t]);
  const items = [...by.entries()]
    .map(([name, list]) => {
      const last = list.reduce((a, b) => (b.occurred_on > a.occurred_on ? b : a));
      // mesma assinatura cobrada mais de uma vez no mesmo mês (ex.: dois planos Apple): soma o mês do último débito
      const sameMonth = list.filter((t) => t.occurred_on.slice(0, 7) === last.occurred_on.slice(0, 7));
      return {
        name,
        monthly_cents: sameMonth.reduce((s, t) => s + t.amount_cents, 0),
        last_on: last.occurred_on,
        account: last.account,
        charges: list.length,
      };
    })
    .sort((a, b) => b.monthly_cents - a.monthly_cents);
  return { items, total_cents: items.reduce((s, i) => s + i.monthly_cents, 0) };
}
