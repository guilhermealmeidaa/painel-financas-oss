/**
 * Fase 2 do MCP: perguntas do dia a dia (puro, testável).
 * Vencimentos com "saldo cobre", assinaturas com aumento de preço, entradas previstas × recebidas, paginação.
 */
import { addDays, lastDayOfMonth } from "../dates";
import { norm } from "../engine";

const reais = (c: number) => Math.round(c) / 100;
const dom = (iso: string) => Number(iso.slice(8, 10));
/** Data com o dia limitado ao fim do mês (31 em fevereiro vira 28/29). */
export const dayInMonth = (month: string, day: number) =>
  `${month.slice(0, 8)}${String(Math.min(day, dom(lastDayOfMonth(month)))).padStart(2, "0")}`;

// ---------- proximos_vencimentos ----------

export interface DueItem {
  name: string;
  cents: number;
  due: string | null;
  autoDebit: boolean;
  kind: string;
}

/**
 * Vencimentos não pagos até `today + days`, em ordem de data, com o saldo acumulado:
 * saldo de hoje + entradas previstas até a data − vencimentos anteriores na lista.
 */
export function upcomingDue(p: {
  today: string;
  days: number;
  balanceCents: number;
  items: DueItem[];
  /** entradas previstas que ainda não caíram, com o dia provável (null = sem data conhecida: não conta) */
  incomes: { description: string; cents: number; date: string | null }[];
}) {
  const until = addDays(p.today, p.days);
  const dated = p.items.filter((i) => i.due && i.due >= p.today && i.due <= until).sort((a, b) => a.due!.localeCompare(b.due!) || b.cents - a.cents);
  let spent = 0;
  const rows = dated.map((i) => {
    const income = p.incomes.filter((x) => x.date && x.date <= i.due!).reduce((s, x) => s + x.cents, 0);
    const available = p.balanceCents + income - spent;
    spent += i.cents;
    const covers = available >= i.cents;
    return {
      nome: i.name,
      valor: reais(i.cents),
      vencimento: i.due,
      tipo: i.kind,
      debito_automatico: i.autoDebit,
      disponivel_na_data: reais(available),
      saldo_cobre: covers,
      ...(covers ? {} : { falta: reais(i.cents - Math.max(available, 0)) }),
    };
  });
  return {
    ate: until,
    saldo_hoje: reais(p.balanceCents),
    entradas_previstas: p.incomes.map((x) => ({ descricao: x.description, valor: reais(x.cents), data_provavel: x.date })),
    total: reais(dated.reduce((s, i) => s + i.cents, 0)),
    vencimentos: rows,
    sem_data_conhecida: p.items.filter((i) => !i.due).map((i) => ({ nome: i.name, valor: reais(i.cents), tipo: i.kind })),
  };
}

/** Dia provável do vencimento de um fixo: o dia em que ele foi pago no mês mais recente. */
export function likelyDay(payDates: string[]): number | null {
  const last = [...payDates].sort().at(-1);
  return last ? dom(last) : null;
}

export const AUTO_DEBIT = /deb(ito)?\.?\s*aut|debito\s+automatico|déb\.?\s*aut/i;


// ---------- assinaturas ----------

export interface SubCharge {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  account: string | null;
  auto_reason: string | null;
  bucket?: string;
  is_inflow?: boolean;
  total_installments?: number | null;
}

/**
 * Comerciantes de assinatura conhecidos. O banco escreve o mesmo serviço de vários jeitos
 * ("Dm *Spotify", "Dl*Spotify P487a", "Amazonprimebr"); a ordem importa (Canais/Aluguel antes de Prime).
 * `variable`: valor muda todo mês (uso), então não separa por valor.
 */
const KNOWN: { re: RegExp; name: string; variable?: boolean }[] = [
  { re: /chatgpt|openai/, name: "ChatGPT" },
  { re: /claude|anthropic/, name: "Claude" },
  { re: /spotify/, name: "Spotify" },
  { re: /disney/, name: "Disney+" },
  { re: /amazon\s*prime\s*canais/, name: "Amazon Prime Canais" },
  { re: /amazon\s*prime\s*aluguel/, name: "Amazon Prime Aluguel", variable: true },
  { re: /amazon\s*prime|amazonprime/, name: "Amazon Prime" },
  { re: /apple\.?\s*com|itunes/, name: "Apple" },
  { re: /microsoft/, name: "Microsoft 365" },
  { re: /supabase/, name: "Supabase", variable: true },
  { re: /railway/, name: "Railway", variable: true },
  { re: /vercel/, name: "Vercel", variable: true },
  { re: /github/, name: "GitHub" },
  { re: /discord/, name: "Discord Nitro" },
  { re: /x corp|twitter/, name: "X" },
  { re: /ifood\s*club/, name: "iFood Club" },
  { re: /melimais|meli\s*\+|meli\s*mais/, name: "Meli+" },
  { re: /netflix/, name: "Netflix" },
  { re: /youtube/, name: "YouTube Premium" },
  { re: /google\s*(one|storage)/, name: "Google One" },
  { re: /deezer/, name: "Deezer" },
  { re: /globoplay/, name: "Globoplay" },
  { re: /\bhbo\b|max\.com/, name: "Max" },
  { re: /paramount/, name: "Paramount+" },
  { re: /icloud/, name: "iCloud" },
  { re: /notion/, name: "Notion" },
  { re: /adobe/, name: "Adobe" },
  { re: /canva/, name: "Canva" },
];
const NOT_SUB = /\biof\b|transfer|pix|pagamento|pagto|fatura|juros|estorno|saque/;
const lower = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Chave de um comerciante desconhecido: sem prefixos de adquirente ("dm*", "ec *") e sem números/cidade. */
const genericKey = (d: string) =>
  lower(d)
    .replace(/^[a-z]{1,3}\s*\*\s*/, "")
    .replace(/sao paulo|bra\b|br\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(" ");

interface Cluster {
  mean: number;
  items: SubCharge[];
}
const monthsOf = (c: Cluster) => [...new Set(c.items.map((i) => i.occurred_on.slice(0, 7)))].sort();
const gapMonths = (a: string, b: string) => {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

function cluster(items: SubCharge[], variable: boolean): Cluster[] {
  if (variable) return [{ mean: items.reduce((s, i) => s + i.amount_cents, 0) / items.length, items }];
  const out: Cluster[] = [];
  for (const i of [...items].sort((a, b) => a.amount_cents - b.amount_cents)) {
    const c = out.find((x) => Math.abs(i.amount_cents - x.mean) <= x.mean * 0.05);
    if (c) {
      c.items.push(i);
      c.mean = c.items.reduce((s, x) => s + x.amount_cents, 0) / c.items.length;
    } else out.push({ mean: i.amount_cents, items: [i] });
  }
  return out;
}

/**
 * Assinaturas detectadas em TODOS os buckets (inclusive Ignorar) nos últimos 120 dias:
 * comerciante conhecido (qualquer quantidade de cobranças) ou desconhecido que se repete por 3 meses seguidos
 * com o mesmo valor (±5%). Mesmo comerciante com dois valores que se repetem EM PARALELO = duas assinaturas
 * (Apple 19,90 e 34,90); cobrança isolada depois da série = aumento de preço (X 2,81 → 5,08);
 * isolada no meio da série = avulsa (não entra no total).
 */
export function subscriptionStats(charges: SubCharge[], today: string) {
  const since = addDays(today, -120);
  const eligible = charges.filter(
    (c) => !c.is_inflow && c.occurred_on >= since && c.occurred_on <= today && !NOT_SUB.test(lower(c.description)) && !((c.total_installments ?? 0) > 1),
  );
  const groups = new Map<string, { name: string; variable: boolean; known: boolean; items: SubCharge[] }>();
  for (const c of eligible) {
    const d = lower(c.description);
    const k = KNOWN.find((x) => x.re.test(d));
    const key = k ? `k:${k.name}` : `g:${genericKey(c.description)}`;
    if (!k && c.bucket !== "assinatura" && key === "g:") continue;
    const g = groups.get(key) ?? { name: k?.name ?? c.description.trim(), variable: Boolean(k?.variable), known: Boolean(k), items: [] };
    g.items.push(c);
    groups.set(key, g);
  }

  const subs: { name: string; items: SubCharge[]; avulsas: SubCharge[]; variable?: boolean }[] = [];
  for (const g of groups.values()) {
    const clusters = cluster(g.items, g.variable);
    const recurring = clusters.filter((c) => monthsOf(c).length >= 2);
    if (!g.known) {
      // desconhecido: só se repete 3 meses seguidos (ou já está marcado como assinatura)
      const ok = clusters.filter((c) => {
        const m = monthsOf(c);
        const days = c.items.map((i) => Number(i.occurred_on.slice(8, 10)));
        const sameDay = Math.max(...days) - Math.min(...days) <= 6 && c.items.length === m.length;
        return (m.length >= 3 && sameDay && m.slice(1).every((x, i) => gapMonths(m[i], x) === 1)) || c.items.some((i) => i.bucket === "assinatura");
      });
      for (const c of ok) subs.push({ name: g.name, items: c.items, avulsas: [] });
      continue;
    }
    if (!recurring.length) {
      subs.push({ name: g.name, items: g.items, avulsas: [], variable: g.variable });
      continue;
    }
    const parallel = recurring.length > 1 && recurring.some((a, i) => recurring.some((b, j) => j !== i && monthsOf(a).some((m) => monthsOf(b).includes(m))));
    const singles = clusters.filter((c) => !recurring.includes(c)).flatMap((c) => c.items);
    if (parallel) {
      const base = recurring.map((c) => ({ name: `${g.name} ${(c.mean / 100).toFixed(2).replace(".", ",")}`, items: [...c.items], avulsas: [] as SubCharge[] }));
      for (const s of singles) {
        // isolada depois do fim da série mais próxima em valor = aumento; senão, avulsa
        const target = base.reduce((a, b) => (Math.abs(b.items[0].amount_cents - s.amount_cents) < Math.abs(a.items[0].amount_cents - s.amount_cents) ? b : a));
        const last = [...target.items].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)).at(-1)!;
        if (s.occurred_on.slice(0, 7) > last.occurred_on.slice(0, 7)) target.items.push(s);
        else target.avulsas.push(s);
      }
      subs.push(...base);
    } else {
      const main = recurring.flatMap((c) => c.items);
      const covered = new Set(main.map((i) => i.occurred_on.slice(0, 7)));
      const lastMonth = [...covered].sort().at(-1)!;
      subs.push({
        name: g.name,
        variable: g.variable,
        items: [...main, ...singles.filter((s) => s.occurred_on.slice(0, 7) > lastMonth)],
        avulsas: singles.filter((s) => s.occurred_on.slice(0, 7) <= lastMonth && covered.has(s.occurred_on.slice(0, 7))),
      });
      // isolada num mês sem a série (nem depois): também avulsa
      const last = subs.at(-1)!;
      for (const s of singles) if (!last.items.includes(s) && !last.avulsas.includes(s)) last.avulsas.push(s);
    }
  }

  const items = subs.map(({ name, items: list, avulsas, variable }) => {
    const sorted = [...list].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const last = sorted.at(-1)!;
    const months = [...new Set(sorted.map((c) => c.occurred_on.slice(0, 7)))];
    const perMonth = months.map((m) => sorted.filter((c) => c.occurred_on.startsWith(m)).reduce((s, c) => s + c.amount_cents, 0));
    const gaps = months.slice(1).map((m, i) => gapMonths(months[i], m));
    const freq = !gaps.length ? "única até agora" : gaps.every((g) => g === 1) ? "mensal" : gaps.every((g) => g >= 11 && g <= 13) ? "anual" : "irregular";
    const prev = perMonth.at(-2);
    const cur = perMonth.at(-1)!;
    const increased = !variable && prev != null && cur > prev * 1.05;
    const avg = Math.round(perMonth.reduce((s, v) => s + v, 0) / perMonth.length);
    // valor variável (uso): o mensal é a média; fixo: o último
    const monthly = freq === "anual" ? Math.round(cur / 12) : variable ? avg : cur;
    const stale = last.occurred_on < addDays(today, -45);
    return {
      nome: name,
      ultimo_debito: last.occurred_on,
      ultimo_valor: reais(cur),
      valor_medio: reais(avg),
      ...(variable ? { valor_variavel: true } : {}),
      cartao: last.account,
      frequencia: freq,
      cobrancas: list.length,
      aumentou: increased,
      ...(increased ? { valor_anterior: reais(prev!), aumento: reais(cur - prev!) } : {}),
      mensal_equivalente: reais(monthly),
      possivelmente_cancelada: stale,
      ids: sorted.map((c) => c.id),
      ...(avulsas.length ? { avulsas: avulsas.map((a) => ({ id: a.id, data: a.occurred_on, valor: reais(a.amount_cents), descricao: a.description })) } : {}),
    };
  });
  items.sort((a, b) => b.mensal_equivalente - a.mensal_equivalente);
  const ativas = items.filter((i) => !i.possivelmente_cancelada);
  return {
    janela: { de: since, ate: today },
    total_mensal: reais(Math.round(ativas.reduce((s, i) => s + i.mensal_equivalente * 100, 0))),
    aumentaram: items.filter((i) => i.aumentou).map((i) => i.nome),
    assinaturas: items,
  };
}

// ---------- entradas ----------

export interface IncomeRow {
  id: string;
  description: string;
  amount_cents: number;
  kind: string;
  source: string;
  status: string;
  transaction_id: string | null;
}

/**
 * Previstas (cadastradas) × recebidas (banco), na mesma regra da âncora do mês:
 * prevista recebida = entrada do banco no mês com valor a até 5% dela.
 * Entradas do banco sem par e ainda "auto" (não confirmadas) aparecem separadas.
 */
export function incomesReport(rows: IncomeRow[], txDate: (id: string | null) => string | null) {
  const planned = rows.filter((r) => r.source === "manual");
  const bank = rows.filter((r) => r.source === "banco");
  const free = [...bank];
  const previstas = planned.map((p) => {
    const i = free.findIndex((b) => Math.abs(b.amount_cents - p.amount_cents) <= p.amount_cents * 0.05);
    const hit = i >= 0 ? free.splice(i, 1)[0] : null;
    return {
      id: p.id,
      descricao: p.description,
      tipo: p.kind,
      valor: reais(p.amount_cents),
      status: hit ? "recebida" : "pendente",
      ...(hit ? { recebida_em: txDate(hit.transaction_id), valor_recebido: reais(hit.amount_cents), id_do_banco: hit.id, transacao: hit.transaction_id } : {}),
    };
  });
  const view = (b: IncomeRow) => ({ id: b.id, descricao: b.description, valor: reais(b.amount_cents), data: txDate(b.transaction_id), transacao: b.transaction_id, status: b.status });
  return {
    previstas,
    total_previsto: reais(planned.reduce((s, p) => s + p.amount_cents, 0)),
    total_recebido: reais(bank.filter((b) => b.status !== "rejeitada").reduce((s, b) => s + b.amount_cents, 0)),
    falta_receber: reais(planned.filter((_, i) => previstas[i].status === "pendente").reduce((s, p) => s + p.amount_cents, 0)),
    avulsas_nao_confirmadas: free.filter((b) => b.status === "auto").map(view),
    avulsas_confirmadas: free.filter((b) => b.status === "confirmada").map(view),
  };
}

// ---------- paginação ----------

export const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString("base64url");
export function decodeCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  const s = Buffer.from(cursor, "base64url").toString();
  const n = Number(s.startsWith("o:") ? s.slice(2) : NaN);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Busca sem acento e sem diferenciar maiúsculas. */
export const matches = (text: string, q?: string) => !q || norm(text).includes(norm(q));
