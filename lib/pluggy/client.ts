import "server-only";

/**
 * Cliente mínimo da API da Pluggy (https://api.pluggy.ai). Só roda no servidor.
 * Docs: https://docs.pluggy.ai — auth via POST /auth (clientId/clientSecret -> apiKey, 2h),
 * header X-API-KEY, transações pela /v2/transactions (cursor; a v1 sai em 31/12/2026).
 * Nunca logar apiKey, connect token nem respostas completas.
 */
const BASE = "https://api.pluggy.ai";

let cached: { key: string; expiresAt: number } | null = null;

export class PluggyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export function pluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

async function apiKey(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
    cache: "no-store",
  });
  if (!res.ok) throw new PluggyError("Falha ao autenticar na Pluggy", res.status);
  const body = (await res.json()) as { apiKey?: string };
  if (!body.apiKey) throw new PluggyError("Resposta de auth sem apiKey", 500);
  // A chave vale 2h; renova com folga de 10 min.
  cached = { key: body.apiKey, expiresAt: Date.now() + 110 * 60 * 1000 };
  return body.apiKey;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = async () =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "X-API-KEY": await apiKey(), ...init?.headers },
      cache: "no-store",
    });
  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    cached = null; // chave pode ter expirado antes do previsto
    res = await doFetch();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    // só o caminho sem query (não vaza ids de conta nos logs)
    throw new PluggyError(`Pluggy ${path.split("?")[0]} respondeu ${res.status}: ${body.message ?? ""}`.trim(), res.status, body.code);
  }
  return (await res.json()) as T;
}

// ---- Tipos (só os campos que usamos) ----
export interface PluggyItem {
  id: string;
  status: string;
  executionStatus?: string;
  consentExpiresAt?: string | null;
  connector?: { id: number; name: string } | null;
  lastUpdatedAt?: string | null;
}
export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  itemId: string;
  creditData?: {
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
    availableCreditLimit?: number | null;
    creditLimit?: number | null;
    minimumPayment?: number | null;
  } | null;
}
export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  status?: "POSTED" | "PENDING";
  category?: string | null;
  paymentData?: { paymentMethod?: string | null } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    billId?: string | null;
    purchaseDate?: string | null;
  } | null;
}
export interface PluggyBill {
  id: string;
  dueDate: string;
  billClosingDate?: string | null;
  totalAmount: number;
  minimumPaymentAmount?: number | null;
}
interface Page<T> {
  results: T[];
  totalPages?: number;
  page?: number;
}

// ---- Endpoints ----

/** Token de 30 min para o widget Pluggy Connect. Com itemId, o widget atualiza aquele item. */
export async function createConnectToken(itemId?: string): Promise<string> {
  const body = await call<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: JSON.stringify(itemId ? { itemId } : {}),
  });
  return body.accessToken;
}

export const getItem = (itemId: string) => call<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const body = await call<Page<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return body.results;
}

/** Todas as transações da conta a partir de `dateFrom` (yyyy-mm-dd), seguindo o cursor `next`. */
export async function listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = [];
  let path: string | null = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
  for (let guard = 0; path && guard < 50; guard++) {
    const body: { results: PluggyTransaction[]; next?: string | null } = await call(path);
    out.push(...body.results);
    path = body.next ? `/v2/transactions${body.next}` : null;
  }
  return out;
}

export async function listBills(accountId: string): Promise<PluggyBill[]> {
  const body = await call<Page<PluggyBill>>(`/bills?accountId=${encodeURIComponent(accountId)}`);
  return body.results;
}
