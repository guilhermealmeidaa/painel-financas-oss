// Resumo "realizado" de um mês a partir das transações do banco (puro, testável).
import { defaultBucket } from "./pluggy/map";

export interface HistTx {
  occurred_on: string;
  description: string;
  amount_cents: number;
  method: string;
  is_inflow: boolean;
  bucket: string;
  pluggy_category: string | null;
  account_kind: "credit_card" | "checking" | null;
  source: string;
  external_id: string | null;
}

const CATEGORY_PT: Record<string, string> = {
  "Food delivery": "Delivery",
  "Eating out": "Restaurantes",
  Groceries: "Mercado",
  "Gas stations": "Combustível",
  Automotive: "Carro/moto",
  "Taxi and ride-hailing": "Uber/táxi",
  "Digital services": "Assinaturas digitais",
  Shopping: "Compras",
  Clothing: "Roupas",
  Wellness: "Bem-estar",
  "Pet supplies and vet": "Pet",
  Pharmacy: "Farmácia",
  Travel: "Viagem",
  Transfers: "Transferências",
  Services: "Serviços",
  Electricity: "Luz",
  Mobile: "Celular",
  Internet: "Internet",
  "Loans and financing": "Empréstimos",
  "Tax on financial operations": "IOF",
  Leisure: "Lazer",
  Entertainment: "Entretenimento",
  Education: "Educação",
  Health: "Saúde",
};

export const categoryPt = (c: string | null) => (c ? (CATEGORY_PT[c] ?? c) : "Sem categoria do banco");

/** Não é gasto nem renda de verdade: pagar fatura, mandar dinheiro pra si mesmo, investir. */
function isInternal(t: HistTx) {
  const d = defaultBucket(t.description, t.pluggy_category);
  return d === "ignorar";
}

export function monthHistory(txs: HistTx[]) {
  const fromBank = txs.filter((t) => t.external_id);
  // Entradas: só na conta (no cartão, "entrada" é pagamento/estorno)
  const ins = fromBank.filter((t) => t.is_inflow && t.account_kind !== "credit_card" && !isInternal(t));
  // Saídas: compras no cartão + débitos/Pix na conta, menos pagamento de fatura e transferência própria
  const outs = fromBank.filter((t) => !t.is_inflow && !isInternal(t));

  const group = (list: HistTx[], key: (t: HistTx) => string) => {
    const m = new Map<string, { cents: number; count: number }>();
    for (const t of list) {
      const k = key(t);
      const g = m.get(k) ?? { cents: 0, count: 0 };
      g.cents += t.amount_cents;
      g.count++;
      m.set(k, g);
    }
    return [...m.entries()].map(([label, g]) => ({ label, ...g })).sort((a, b) => b.cents - a.cents);
  };

  const sum = (l: HistTx[]) => l.reduce((s, t) => s + t.amount_cents, 0);
  return {
    totalIn: sum(ins),
    totalOut: sum(outs),
    onCard: sum(outs.filter((t) => t.account_kind === "credit_card")),
    onAccount: sum(outs.filter((t) => t.account_kind !== "credit_card")),
    inflows: group(ins, (t) => t.description.split("|")[0].trim()).slice(0, 8),
    byCategory: group(outs, (t) => categoryPt(t.pluggy_category)),
    biggest: [...outs].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 10),
    count: fromBank.length,
  };
}
