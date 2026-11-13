import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildGasto, remainingFor, scopesOf } from "@/lib/mcp/write";

const nu = { id: "nu", name: "Cartão A ", kind: "credit_card" };
const d = {
  accounts: [nu, { id: "cc", name: "Conta", kind: "checking" }],
  budgets: [
    { month: "2026-11-01", method: "credito" },
    { month: "2026-12-01", method: "debito_pix" },
  ],
} as never;
const find = (n: string) => (n.toLowerCase().startsWith("cart") ? nu : null);
const TODAY = "2026-11-13";

describe("lancar_gasto: validação e montagem", () => {
  it("padrões: hoje, lazer, meio do mês (crédito), sem cartão", () => {
    const r = buildGasto(d, { valor: 42.5, descricao: "  Almoço   no centro " }, TODAY, find);
    expect(r).toEqual({
      row: { amount_cents: 4250, description: "Almoço no centro", occurred_on: TODAY, bucket: "lazer", method: "credito", account_id: null, idempotency_key: null },
      cartao: null,
    });
  });

  it("cartão resolve pelo nome e implica crédito; chave vai junto", () => {
    const r = buildGasto(d, { valor: 10, descricao: "Café", cartao: "cartão", chave: "abc-12345" }, TODAY, find);
    expect(r).toMatchObject({ row: { method: "credito", account_id: "nu", idempotency_key: "abc-12345" }, cartao: "Cartão A" });
  });

  it("mês em débito/Pix sem meio informado = pix", () => {
    const r = buildGasto(d, { valor: 10, descricao: "Pão", data: "2026-11-13" }, TODAY, find);
    expect(r).toMatchObject({ row: { method: "credito" } });
    const dez = buildGasto({ ...(d as object), budgets: [{ month: "2026-12-01", method: "debito_pix" }] } as never, { valor: 10, descricao: "Pão", data: "2026-12-02" }, "2026-12-05", find);
    expect(dez).toMatchObject({ row: { method: "pix" } });
  });

  it("recusa: futuro, mais de 90 dias, cartão no Pix, cartão inexistente, valor zero", () => {
    expect(buildGasto(d, { valor: 10, descricao: "x", data: "2026-11-14" }, TODAY, find)).toHaveProperty("erro");
    expect(buildGasto(d, { valor: 10, descricao: "x", data: "2026-08-01" }, TODAY, find)).toHaveProperty("erro");
    expect(buildGasto(d, { valor: 10, descricao: "x", meio: "pix", cartao: "cartão" }, TODAY, find)).toHaveProperty("erro");
    expect(buildGasto(d, { valor: 10, descricao: "x", cartao: "itau" }, TODAY, find)).toMatchObject({ cartoes: ["Cartão A"] });
    expect(buildGasto(d, { valor: 0.001, descricao: "x" }, TODAY, find)).toHaveProperty("erro");
    expect(buildGasto(d, { valor: 10, descricao: "   " }, TODAY, find)).toHaveProperty("erro");
  });
});

describe("lancar_gasto: escopo e 'ainda posso gastar'", () => {
  it("sem escopo write não lança", () => {
    expect(scopesOf({ http: { authInfo: { scopes: ["read"] } } }).includes("write")).toBe(false);
    expect(scopesOf({}).includes("write")).toBe(false);
    expect(scopesOf({ http: { authInfo: { scopes: ["read", "write"] } } }).includes("write")).toBe(true);
  });

  it("o gasto lançado baixa o 'ainda posso gastar' do mês", () => {
    const base = {
      budgets: [{ month: "2026-11-01", method: "credito", cap_cents: 150000, control_start: "2026-11-05", skipped_weekends: [], allocations: [{ bucket: "lazer", amount_cents: 150000 }] }],
      transactions: [{ occurred_on: "2026-11-06", amount_cents: 90000, bucket: "lazer", method: "credito", account_id: "nu" }],
    };
    const before = remainingFor(base as never, TODAY, TODAY);
    const after = remainingFor({ ...base, transactions: [...base.transactions, { occurred_on: TODAY, amount_cents: 4250, bucket: "lazer", method: "credito", account_id: null }] } as never, TODAY, TODAY);
    expect(before?.cents).toBe(60000);
    expect(after?.cents).toBe(55750);
    expect(remainingFor(base as never, "2027-01-02", TODAY)).toBeNull();
  });
});
