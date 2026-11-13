import { addDays } from "@/lib/dates";
import { genericKey } from "@/lib/mcp/phase2";

export interface AnomalyTx {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  account_id: string | null;
  bucket: string;
  is_inflow: boolean;
  external_id: string | null;
  total_installments: number | null;
  auto_reason: string | null;
}

export type AnomalyKind = "acima_do_normal" | "cobranca_repetida" | "primeira_vez_alta";

export interface Anomaly {
  kind: AnomalyKind;
  tx: AnomalyTx;
  /** valor típico daquele comerciante (mediana), quando há histórico */
  typical?: number;
  /** a outra cobrança igual, quando é repetida */
  twin?: AnomalyTx;
  reason: string;
}

const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** O que não é "compra": entradas, ignorados, pagamentos de fatura, transferências entre contas suas, parcelas. */
const isPurchase = (t: AnomalyTx) =>
  !t.is_inflow && t.bucket !== "ignorar" && t.bucket !== "parcela" && !t.total_installments && !/transfer|pagamento_fatura|propria/.test(t.auto_reason ?? "");

/**
 * Gastos fora do padrão nos últimos `days` dias (padrão 30), só do banco:
 * - acima do normal: ≥ 2× a mediana do mesmo comerciante nos 6 meses anteriores (com ≥ 3 compras) e ≥ R$ 50 a mais;
 * - cobrança repetida: mesmo comerciante, mesmo valor, mesmo cartão/conta, com até 1 dia de diferença;
 * - primeira vez e alta: comerciante sem histórico em 6 meses, a partir de R$ 300.
 * Não muda nada: só aponta, com o motivo.
 */
export function findAnomalies(txs: AnomalyTx[], today: string, days = 30): Anomaly[] {
  const bank = txs.filter((t) => t.external_id && isPurchase(t) && t.occurred_on <= today);
  const from = addDays(today, -days);
  const histFrom = addDays(from, -180);
  const byKey = new Map<string, AnomalyTx[]>();
  for (const t of bank) {
    if (t.occurred_on < histFrom) continue;
    const k = genericKey(t.description);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }

  const out: Anomaly[] = [];
  const seenTwin = new Set<string>();
  for (const t of bank.filter((x) => x.occurred_on >= from)) {
    const k = genericKey(t.description);
    if (!k) continue;
    const same = byKey.get(k) ?? [];

    const twin = same.find(
      (o) => o.id !== t.id && o.amount_cents === t.amount_cents && o.account_id === t.account_id && dayGap(o.occurred_on, t.occurred_on) <= 1,
    );
    if (twin) {
      // o par aparece uma vez só
      if (!seenTwin.has(t.id)) {
        seenTwin.add(t.id).add(twin.id);
        out.push({ kind: "cobranca_repetida", tx: t, twin, reason: `duas cobranças de ${brl(t.amount_cents)} em ${t.description.trim()} com até 1 dia de diferença` });
      }
      continue;
    }

    const before = same.filter((o) => o.occurred_on < t.occurred_on && o.occurred_on >= addDays(t.occurred_on, -180));
    if (before.length >= 3) {
      const typical = median(before.map((o) => o.amount_cents));
      if (t.amount_cents >= typical * 2 && t.amount_cents - typical >= 5000) {
        out.push({ kind: "acima_do_normal", tx: t, typical, reason: `${brl(t.amount_cents)}; o normal ali é ${brl(typical)}` });
      }
    } else if (before.length === 0 && t.amount_cents >= 30000 && t.bucket !== "fixo" && t.bucket !== "assinatura") {
      // conta fixa e assinatura são planejadas: não são "primeira vez" suspeita
      out.push({ kind: "primeira_vez_alta", tx: t, reason: `primeira compra nesse lugar (no histórico do banco), de ${brl(t.amount_cents)}` });
    }
  }
  return out.sort((a, b) => b.tx.occurred_on.localeCompare(a.tx.occurred_on));
}
