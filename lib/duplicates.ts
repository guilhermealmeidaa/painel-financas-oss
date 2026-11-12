/**
 * Pares de transações que parecem o MESMO gasto contado duas vezes (puro).
 * Só entra par com evidência forte:
 *  - descrição/destinatário parecido (mesma pessoa/loja), ou
 *  - manual × banco (lançamento seu ainda não juntado), ou
 *  - mesmo id de transação do banco, ou
 *  - PENDING × POSTED na mesma conta.
 * Fora: valores iguais por coincidência (Microsoft 51 × Remédio 50), pares já explicados
 * pelo Pix no crédito, itens ignorados, substituídos ou já juntados.
 */
import { norm } from "./engine";

export interface DupTx {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  is_inflow: boolean;
  bucket: string;
  account_id: string | null;
  source: string;
  external_id: string | null;
  pluggy_status: string | null;
  auto_reason: string | null;
  linked_tx_id: string | null;
  superseded: boolean;
  manual_id: string | null;
}

export interface DupPair {
  a: DupTx;
  b: DupTx;
  diff: number;
  reasons: string[];
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Palavras que aparecem em qualquer descrição e não identificam ninguém. */
const GENERIC = new Set([
  "transferencia", "enviada", "enviado", "recebida", "recebido", "pelo", "pix", "pagamento", "efetuado", "compra", "debito",
  "credito", "cartao", "visa", "electron", "brasil", "ltda", "comercio", "industria", "servicos", "online", "agencia",
  "de", "da", "do", "dos", "das", "e", "s/a", "sa", "me", "com",
]);

/** Destinatário/loja normalizado: o que vem depois do último "|", sem palavras genéricas. */
export function partyTokens(description: string): string[] {
  const part = description.includes("|") ? description.slice(description.lastIndexOf("|") + 1) : description;
  return norm(part)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w));
}

/**
 * Mesma pessoa/loja? Compara só o destinatário. Exige descrição igual, ou pelo menos 2 palavras em comum
 * cobrindo 60% das palavras do nome mais curto (Jaccard alto). "Taisa Costa Correa" × "Antonio Alves de Lima" = não.
 */
export function sameMerchant(a: string, b: string): boolean {
  const ta = partyTokens(a);
  const tb = partyTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const sb = new Set(tb.map((w) => w.slice(0, 6)));
  const shared = new Set(ta.map((w) => w.slice(0, 6)).filter((w) => sb.has(w))).size;
  const shorter = Math.min(new Set(ta).size, new Set(tb).size);
  return shared >= Math.min(2, shorter) && shared / shorter >= 0.6;
}
const similar = (a: string, b: string) => sameMerchant(a, b);

export function findDuplicates(txs: DupTx[], opts: { includeInstallments?: boolean } = {}): DupPair[] {
  const pool = txs.filter(
    (t) =>
      !t.is_inflow &&
      !t.superseded &&
      t.bucket !== "ignorar" &&
      (opts.includeInstallments || t.bucket !== "parcela") &&
      !t.auto_reason?.startsWith("pix_no_credito") &&
      t.auto_reason !== "juntado_manual" &&
      !t.manual_id,
  );
  // compras de cartão que já são o "outro lado" de um Pix no crédito
  const pixLinked = new Set(txs.filter((t) => t.auto_reason === "pix_no_credito" && t.linked_tx_id).map((t) => t.linked_tx_id));
  const pairs: DupPair[] = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const diff = Math.abs(a.amount_cents - b.amount_cents);
      if (diff > Math.max(100, Math.max(a.amount_cents, b.amount_cents) * 0.02)) continue;
      if (Math.abs(day(a.occurred_on) - day(b.occurred_on)) > 3) continue;
      if (pixLinked.has(a.id) && pixLinked.has(b.id)) continue;

      const reasons: string[] = [];
      if (a.external_id && a.external_id === b.external_id) reasons.push("mesmo id de transação do banco");
      if (a.source !== b.source && (a.source === "manual" || b.source === "manual")) reasons.push("um manual e outro do banco");
      if (a.pluggy_status && b.pluggy_status && a.pluggy_status !== b.pluggy_status && a.account_id && a.account_id === b.account_id && similar(a.description, b.description))
        reasons.push("PENDING × POSTED na mesma conta");
      if (similar(a.description, b.description)) reasons.push("mesma pessoa/loja");
      if (!reasons.length) continue;
      if (a.occurred_on === b.occurred_on) reasons.push("mesmo dia");
      pairs.push({ a, b, diff, reasons });
    }
  return pairs;
}
