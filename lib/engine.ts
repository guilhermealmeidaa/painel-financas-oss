/**
 * Motor de classificação automática (puro, sem banco). Roda depois de cada sync.
 *
 * Princípios:
 * - Nunca mexe no que o usuário escolheu (user_locked) nem em lançamentos manuais.
 * - Toda decisão tem um motivo (auto_reason) e pode ser desfeita (prev_bucket guardado pelo writer).
 * - Pares/trincas que representam o MESMO dinheiro (Pix no crédito, pagamento de fatura,
 *   transferência própria) viram "ignorar" dos lados que não são gasto de verdade.
 */
import { defaultBucket } from "./pluggy/map";
import type { Bucket } from "./projection";

export interface EngineTx {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  is_inflow: boolean;
  method: string;
  bucket: Bucket;
  account_id: string | null;
  account_kind: "credit_card" | "checking" | null;
  pluggy_category: string | null;
  source: string;
  user_locked: boolean;
  superseded: boolean;
  auto_reason: string | null;
}

export interface EngineRule {
  pattern: string;
  bucket: Bucket;
  subtype: string | null;
  origin: "usuario" | "padrao" | string;
}

export interface Decision {
  bucket: Bucket;
  auto_reason: string;
  linked_tx_id?: string | null;
  fee_cents?: number | null;
  subtype?: string | null;
}

export interface EngineInput {
  txs: EngineTx[];
  rules: EngineRule[];
  self: { names: string[]; taxIds: string[] };
}

// ---------- utilidades ----------

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const digits = (s: string) => s.replace(/\D/g, "");

/** "Transferência enviada pelo Pix|ANNA CAROLINA" -> "anna carolina" */
export function recipient(description: string): string {
  const i = description.indexOf("|");
  return norm(i >= 0 ? description.slice(i + 1) : description);
}

const STOP = new Set(["de", "da", "do", "dos", "das", "e", "ltda", "sa", "s/a", "me", "eireli", "com", "br"]);
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** O destinatário do Pix e o nome que aparece no cartão são a mesma pessoa/loja? */
export function sameParty(pixDescription: string, cardDescription: string): boolean {
  const a = tokens(recipient(pixDescription));
  const b = new Set(tokens(cardDescription).map((w) => w.slice(0, 5)));
  if (!a.length) return false;
  const hits = a.filter((w) => b.has(w.slice(0, 5))).length;
  return hits >= Math.min(2, a.length);
}

const isPixCreditTopUp = (t: EngineTx) => t.is_inflow && /valor adicionado na conta por cart/.test(norm(t.description));
const isCardPaymentIn = (t: EngineTx) =>
  t.account_kind === "credit_card" &&
  t.is_inflow &&
  /pagamento recebido|pagamento de fatura|pagamento on ?line|pagto debito automatic|debito automatico|pagamento efetuado/.test(norm(t.description));
const isOutgoingTransfer = (t: EngineTx) => !t.is_inflow && /transferencia enviada|pix enviado/.test(norm(t.description));

export function isSelf(t: EngineTx, self: EngineInput["self"]): boolean {
  if ((t.pluggy_category ?? "").toLowerCase() === "same person transfer") return true;
  const d = norm(t.description);
  const dd = digits(t.description);
  if (self.taxIds.some((id) => id.length >= 8 && dd.includes(digits(id)))) return true;
  return self.names.some((n) => norm(n).split(" ").length >= 2 && d.includes(norm(n)));
}

const IOF = /^(iof|juros)|\biof\b|juros parcelado|encargos/;

// ---------- motor ----------

export function runEngine({ txs, rules, self }: EngineInput): Map<string, Decision> {
  const out = new Map<string, Decision>();
  const editable = (t: EngineTx) => !t.user_locked && !t.superseded && t.source !== "manual";
  const set = (t: EngineTx, d: Decision) => {
    if (editable(t)) out.set(t.id, d);
  };
  const taken = new Set<string>();
  const live = txs.filter((t) => !t.superseded);

  // 1) Transferência para você mesmo (dos dois lados)
  for (const t of live) {
    if (isSelf(t, self)) {
      set(t, { bucket: "ignorar", auto_reason: "transferencia_propria" });
      taken.add(t.id);
    }
  }

  // 2) Pagamento de fatura: saída na conta × "Pagamento recebido" no cartão (mesmo valor, ±2 dias)
  const cardPayments = live.filter((t) => isCardPaymentIn(t));
  for (const p of cardPayments) {
    set(p, { bucket: "ignorar", auto_reason: "pagamento_fatura" });
    taken.add(p.id);
  }
  for (const t of live) {
    if (t.is_inflow || t.account_kind === "credit_card" || taken.has(t.id)) continue;
    const pair = cardPayments.find(
      (p) => !taken.has(`pay:${p.id}`) && Math.abs(p.amount_cents - t.amount_cents) <= 1 && Math.abs(day(p.occurred_on) - day(t.occurred_on)) <= 2,
    );
    const byText = defaultBucket(t.description, t.pluggy_category) === "ignorar";
    if (pair || byText) {
      if (pair) taken.add(`pay:${pair.id}`);
      set(t, { bucket: "ignorar", auto_reason: "pagamento_fatura", linked_tx_id: pair?.id ?? null });
      taken.add(t.id);
    }
  }

  // 3) Pix no crédito: entrada "Valor adicionado..." X + saída "Transferência enviada|NOME" X (mesmo dia, mesma conta)
  //    + compra no cartão de X a X×1,2, do dia até 2 dias depois. A taxa = cartão − X.
  const topUps = live.filter(isPixCreditTopUp);
  const cards = live.filter((t) => t.account_kind === "credit_card" && !t.is_inflow);
  const legs: { topUp: EngineTx; out: EngineTx }[] = [];
  for (const up of topUps) {
    const o = live.find(
      (t) =>
        !taken.has(t.id) &&
        isOutgoingTransfer(t) &&
        t.account_id === up.account_id &&
        t.amount_cents === up.amount_cents &&
        t.occurred_on === up.occurred_on,
    );
    if (!o) continue;
    taken.add(o.id);
    taken.add(up.id);
    legs.push({ topUp: up, out: o });
  }
  const usedCard = new Set<string>();
  const window = (o: EngineTx, c: EngineTx) => {
    const dd = day(c.occurred_on) - day(o.occurred_on);
    return dd >= 0 && dd <= 2 && c.amount_cents >= o.amount_cents && c.amount_cents <= Math.round(o.amount_cents * 1.2);
  };
  const cardFor = new Map<string, EngineTx>();
  // primeiro quem casa pelo nome; depois, candidato único por valor/data
  for (const { out: o } of legs) {
    const c = cards
      .filter((c) => !usedCard.has(c.id) && window(o, c) && sameParty(o.description, c.description))
      .sort((a, b) => a.amount_cents - b.amount_cents)[0];
    if (c) {
      usedCard.add(c.id);
      cardFor.set(o.id, c);
    }
  }
  for (const { out: o } of legs) {
    if (cardFor.has(o.id)) continue;
    const cands = cards.filter((c) => !usedCard.has(c.id) && window(o, c));
    if (cands.length === 1) {
      usedCard.add(cands[0].id);
      cardFor.set(o.id, cands[0]);
    }
  }
  for (const { topUp, out: o } of legs) {
    const c = cardFor.get(o.id);
    set(topUp, { bucket: "ignorar", auto_reason: "pix_no_credito", linked_tx_id: c?.id ?? o.id });
    set(o, { bucket: "ignorar", auto_reason: "pix_no_credito", linked_tx_id: c?.id ?? null });
  }
  /** taxa por compra de cartão (aplicada junto com a categoria da compra, no passo 4) */
  const feeOf = new Map<string, number>();
  for (const { out: o } of legs) {
    const c = cardFor.get(o.id);
    if (c) feeOf.set(c.id, c.amount_cents - o.amount_cents);
  }

  // 4) Regras (suas > padrão; padrão mais longo primeiro) e categoria do banco
  const sortedRules = [...rules].sort(
    (a, b) => (a.origin === "usuario" ? 0 : 1) - (b.origin === "usuario" ? 0 : 1) || b.pattern.length - a.pattern.length,
  );
  const ruleFor = (desc: string) => {
    const d = norm(desc);
    return sortedRules.find((r) => d.includes(norm(r.pattern)));
  };
  for (const t of live) {
    if (taken.has(t.id) || t.is_inflow || IOF.test(norm(t.description))) continue;
    const fee = feeOf.get(t.id);
    if (t.bucket === "parcela" && !t.auto_reason) {
      if (fee != null) set(t, { bucket: t.bucket, auto_reason: "parcela", fee_cents: fee });
      continue;
    }
    const r = ruleFor(t.description);
    // Já classificado sem motivo registrado (sync antigo ou você): só anota o motivo se a regra
    // concorda; se discorda, pode ter sido escolha sua, então não mexe.
    if (t.bucket !== "sem_categoria" && !t.auto_reason) {
      const would = r?.bucket ?? defaultBucket(t.description, t.pluggy_category);
      if (would && would === t.bucket) {
        set(t, { bucket: t.bucket, auto_reason: r ? `regra:${r.pattern}` : "categoria_banco", subtype: r?.subtype ?? null, fee_cents: fee ?? null });
      } else if (fee != null) {
        set(t, { bucket: t.bucket, auto_reason: "pix_no_credito_taxa", fee_cents: fee });
      }
      continue;
    }
    if (r) {
      set(t, { bucket: r.bucket, auto_reason: `regra:${r.pattern}`, subtype: r.subtype, fee_cents: fee ?? null });
      continue;
    }
    const cat = defaultBucket(t.description, t.pluggy_category);
    if (cat) {
      set(t, { bucket: cat, auto_reason: "categoria_banco", fee_cents: fee ?? null });
      continue;
    }
    if (fee != null) set(t, { bucket: t.bucket, auto_reason: t.auto_reason ?? "pix_no_credito_taxa", fee_cents: fee });
  }

  // 5) IOF / juros herdam o bucket da compra do mesmo cartão (0 a 2 dias antes); senão lazer
  const bucketNow = (t: EngineTx) => out.get(t.id)?.bucket ?? t.bucket;
  for (const t of live) {
    if (t.is_inflow || !IOF.test(norm(t.description))) continue;
    if (t.bucket !== "sem_categoria" && !t.auto_reason) continue;
    const base = live
      .filter(
        (p) =>
          p.id !== t.id &&
          !p.is_inflow &&
          p.account_id === t.account_id &&
          !IOF.test(norm(p.description)) &&
          day(t.occurred_on) - day(p.occurred_on) >= 0 &&
          day(t.occurred_on) - day(p.occurred_on) <= 2,
      )
      .sort((a, b) => day(b.occurred_on) - day(a.occurred_on) || b.amount_cents - a.amount_cents)[0];
    const inherited = base ? bucketNow(base) : null;
    const bucket: Bucket = inherited && inherited !== "sem_categoria" && inherited !== "ignorar" ? inherited : "lazer";
    set(t, { bucket, auto_reason: "iof_herdado", linked_tx_id: base?.id ?? null });
  }

  // não grava o que não mudou
  for (const t of txs) {
    const d = out.get(t.id);
    if (d && d.bucket === t.bucket && d.auto_reason === t.auto_reason && d.fee_cents === undefined && d.linked_tx_id === undefined) {
      out.delete(t.id);
    }
  }
  return out;
}

// ---------- entradas do banco ----------

export interface IncomeCandidate {
  transaction_id: string;
  month: string;
  description: string;
  amount_cents: number;
  kind: "salario" | "outro";
}

/**
 * Entradas reais na conta que viram "Entradas" do mês.
 * Fora: Pix no crédito, transferência própria, pagamento de fatura, estorno/reembolso, entradas no cartão.
 * Salário: "Transferência Recebida"/"salário" perto do salário planejado (±15%) nos primeiros 10 dias.
 * No 1º mês do plano o salário já tinha sido usado antes do plano começar: não entra.
 */
export function detectIncomes(
  txs: EngineTx[],
  opts: { self: EngineInput["self"]; plannedSalaryCents: number; firstMonth: string },
): IncomeCandidate[] {
  const out: IncomeCandidate[] = [];
  for (const t of txs) {
    if (!t.is_inflow || t.superseded || t.account_kind === "credit_card") continue;
    if (isPixCreditTopUp(t) || isSelf(t, opts.self)) continue;
    const d = norm(t.description);
    if (/estorno|reembolso|devolucao|cashback|resgate|rendimento/.test(d)) continue;
    if (defaultBucket(t.description, t.pluggy_category) === "ignorar") continue;
    const month = `${t.occurred_on.slice(0, 7)}-01`;
    const dom = Number(t.occurred_on.slice(8, 10));
    const looksSalary =
      (/salario|transferencia recebida|credito de salario|pagamento de salario/.test(d) || (t.pluggy_category ?? "").toLowerCase() === "salary") &&
      opts.plannedSalaryCents > 0 &&
      Math.abs(t.amount_cents - opts.plannedSalaryCents) <= opts.plannedSalaryCents * 0.15 &&
      dom <= 10;
    if (looksSalary && month === opts.firstMonth) continue;
    out.push({
      transaction_id: t.id,
      month,
      description: looksSalary ? "Salário (banco)" : t.description.split("|").slice(-1)[0].trim().slice(0, 60) || "Entrada",
      amount_cents: t.amount_cents,
      kind: looksSalary ? "salario" : "outro",
    });
  }
  return out;
}
