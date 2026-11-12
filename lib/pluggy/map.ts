// Conversão pura dos dados da Pluggy para as nossas tabelas (testável, sem rede).
import { todayISO } from "../dates";
import type { Bucket } from "../projection";

export interface RuleLike {
  pattern: string;
  bucket: Bucket;
}

export interface MappedTx {
  external_id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  account_id: string | null;
  method: "credito" | "debito" | "pix";
  bucket: Bucket;
  is_inflow: boolean;
  pluggy_status: string | null;
  installment_number: number | null;
  total_installments: number | null;
  pluggy_bill_id: string | null;
  pluggy_category: string | null;
}

interface TxIn {
  id: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  status?: string;
  category?: string | null;
  paymentData?: { paymentMethod?: string | null } | null;
  creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null; billId?: string | null } | null;
}

export const toCents = (v: number) => Math.round(Math.abs(v) * 100);

/** Data da Pluggy (ISO, UTC) -> dia em São Paulo. */
export function pluggyDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO(new Date(iso));
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Primeira regra cujo padrão aparece na descrição (sem acento, sem caixa). Padrões mais longos primeiro. */
export function matchRule(description: string, rules: RuleLike[]): Bucket | null {
  const d = norm(description);
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  return sorted.find((r) => d.includes(norm(r.pattern.trim())))?.bucket ?? null;
}

/**
 * Classificação padrão pela categoria da Pluggy e por descrições óbvias.
 * Vale depois das regras do usuário (que sempre ganham).
 * - Pagar fatura e mandar dinheiro pra si mesmo não é gasto: "ignorar".
 * - Empréstimo, luz, celular, internet, água: contas fixas, já estão na projeção: "fixo".
 */
const CATEGORY_DEFAULTS: Record<string, Bucket> = {
  "credit card payment": "ignorar",
  "same person transfer": "ignorar",
  "investments": "ignorar",
  "loans and financing": "fixo",
  "electricity": "fixo",
  "mobile": "fixo",
  "internet": "fixo",
  "water": "fixo",
  "telecommunications": "fixo",
  // consumo do dia a dia (decisão de 12/11: categoria do banco como padrão, reversível na Triagem)
  "groceries": "mercado",
  "eating out": "lazer",
  "food delivery": "lazer",
  "pet supplies and vet": "lazer",
  "gas stations": "lazer",
  "automotive": "lazer",
  "taxi and ride-hailing": "lazer",
  "shopping": "lazer",
  "online shopping": "lazer",
  "clothing": "lazer",
  "pharmacy": "mercado",
  "wellness": "lazer",
  "bakery": "mercado",
  "convenience stores": "mercado",
};

export function defaultBucket(description: string, category?: string | null): Bucket | null {
  const d = norm(description);
  if (/pagamento (de |efetuado.*)?fatura|pagamento cartao|pagto fatura/.test(d)) return "ignorar";
  if (category) return CATEGORY_DEFAULTS[category.toLowerCase()] ?? null;
  return null;
}

/**
 * Converte uma transação da Pluggy.
 * - Cartão: compra vem positiva; pagamento/estorno vem negativo (entra como "ignorar").
 * - Conta: type DEBIT = saída, CREDIT = entrada (entrada vira "ignorar"; renda é manual).
 * - Parcelada (totalInstallments > 1) vira "parcela": já está nas parcelas/fixos, não é dia a dia.
 */
export function mapTransaction(tx: TxIn, account: { id: string | null; isCard: boolean }, rules: RuleLike[]): MappedTx {
  const isInflow = account.isCard ? tx.amount < 0 : tx.type === "CREDIT";
  const description = (tx.description || tx.descriptionRaw || "Sem descrição").trim().slice(0, 120);
  const total = tx.creditCardMetadata?.totalInstallments ?? null;
  const pm = tx.paymentData?.paymentMethod?.toUpperCase() ?? "";
  const method = account.isCard ? "credito" : pm === "PIX" || /\bpix\b/i.test(description) ? "pix" : "debito";

  // Só o óbvio aqui. Regras, categoria do banco, Pix no crédito etc. ficam com o motor
  // (lib/engine.ts), que grava o motivo de cada decisão e permite desfazer.
  void rules;
  let bucket: Bucket;
  if (isInflow) bucket = "ignorar";
  else if (total && total > 1) bucket = "parcela";
  else bucket = "sem_categoria";

  return {
    external_id: tx.id,
    occurred_on: pluggyDate(tx.date),
    description,
    amount_cents: toCents(tx.amount),
    account_id: account.id,
    method,
    bucket,
    is_inflow: isInflow,
    pluggy_status: tx.status ?? null,
    installment_number: tx.creditCardMetadata?.installmentNumber ?? null,
    total_installments: total,
    pluggy_bill_id: tx.creditCardMetadata?.billId ?? null,
    pluggy_category: tx.category ?? null,
  };
}

/** Diferença em dias entre duas datas ISO. */
function dayDiff(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export interface TxForMatch {
  id: string;
  occurred_on: string;
  amount_cents: number;
  method: string;
  description: string;
}

const STOP = new Set(["com", "dos", "das", "para", "pix", "compra", "transferencia", "enviada", "pagamento", "ltda"]);
const stems = (s: string) =>
  new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5 && !STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );
const sameKind = (a: string, b: string) => (a === "credito") === (b === "credito");

/**
 * Nota de semelhança entre um lançamento manual e uma transação do banco (menor = melhor), ou null se não casam.
 * - Mesmo tipo (crédito com cartão; Pix/débito com conta) e até 3 dias de diferença.
 * - Descrições com palavra parecida (mesmas 5 primeiras letras: "Barbeiro" × "BARBEARIA",
 *   "Claude" × "ANTHROPIC* CLAUDE SUB"): aceita até 30% de diferença (gorjeta, dólar + IOF).
 * - Sem palavra em comum: no máximo 3% (ex.: 275 × 275,02). Na dúvida NÃO casa;
 *   a Triagem sugere "É o mesmo" e você decide. Casar errado é pior que não casar.
 */
export function matchScore(manual: TxForMatch, bank: TxForMatch): number | null {
  if (!sameKind(manual.method, bank.method)) return null;
  const days = dayDiff(manual.occurred_on, bank.occurred_on);
  if (days > 3) return null;
  const diff = Math.abs(manual.amount_cents - bank.amount_cents);
  const rel = diff / Math.max(manual.amount_cents, 1);
  const mw = stems(manual.description);
  const shared = [...stems(bank.description)].some((w) => mw.has(w));
  const ok = shared ? rel <= 0.3 : rel <= 0.03;
  if (!ok) return null;
  return rel * 10 + days - (shared ? 1 : 0);
}

/**
 * Casa lançamentos manuais com transações do banco para não contar o mesmo gasto duas vezes.
 * Guloso pelo melhor par; cada lado casa no máximo uma vez. Retorna pares [idManual, idBanco].
 */
export function matchManual(manual: TxForMatch[], bank: TxForMatch[]): [string, string][] {
  const candidates: { m: string; b: string; score: number }[] = [];
  for (const m of manual)
    for (const b of bank) {
      const score = matchScore(m, b);
      if (score != null) candidates.push({ m: m.id, b: b.id, score });
    }
  candidates.sort((x, y) => x.score - y.score);
  const usedM = new Set<string>();
  const usedB = new Set<string>();
  const pairs: [string, string][] = [];
  for (const c of candidates) {
    if (usedM.has(c.m) || usedB.has(c.b)) continue;
    usedM.add(c.m);
    usedB.add(c.b);
    pairs.push([c.m, c.b]);
  }
  return pairs;
}

/** Vincula uma conta da Pluggy a um cartão já cadastrado pelo nome (ex.: "Nubank Ultravioleta" -> "Nubank"). */
export function findAccountByName<T extends { name: string }>(candidates: T[], ...names: (string | null | undefined)[]): T | undefined {
  const hay = norm(names.filter(Boolean).join(" "));
  return candidates.find((c) => hay.includes(norm(c.name)));
}
