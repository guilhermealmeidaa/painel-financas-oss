import { describe, expect, it } from "vitest";
import { findAccountByName, mapTransaction, matchManual, matchRule } from "@/lib/pluggy/map";



const rules = [
  { pattern: "CLAUDE", bucket: "lazer" as const },
  { pattern: "ifood", bucket: "mercado" as const },
];

describe("mapeamento das transações da Pluggy", () => {
  const card = { id: "acc-nu", isCard: true };
  const bank = { id: "acc-cc", isCard: false };

  it("compra no cartão: positiva, crédito; regras ficam com o motor", () => {
    const m = mapTransaction(
      { id: "t1", date: "2026-11-10T15:00:00.000Z", description: "CLAUDE.AI SUBSCRIPTION", amount: 96, type: "DEBIT" },
      card,
      rules,
    );
    expect(m).toMatchObject({ amount_cents: 9600, method: "credito", bucket: "sem_categoria", is_inflow: false, occurred_on: "2026-11-10" });
  });

  it("pagamento de fatura no cartão vem negativo e é ignorado", () => {
    const m = mapTransaction({ id: "t2", date: "2026-11-05", description: "Pagamento recebido", amount: -1200, type: "CREDIT" }, card, rules);
    expect(m).toMatchObject({ amount_cents: 120000, is_inflow: true, bucket: "ignorar" });
  });

  it("compra parcelada vira 'parcela' (já está na projeção)", () => {
    const m = mapTransaction(
      {
        id: "t3",
        date: "2026-11-10",
        description: "LOJA X 1/4",
        amount: 49,
        type: "DEBIT",
        creditCardMetadata: { installmentNumber: 1, totalInstallments: 4 },
      },
      card,
      rules,
    );
    expect(m.bucket).toBe("parcela");
    expect(m.total_installments).toBe(4);
  });

  it("conta corrente: Pix de saída e salário de entrada", () => {
    const pix = mapTransaction(
      { id: "t4", date: "2026-11-11", description: "Transferência enviada", amount: -50, type: "DEBIT", paymentData: { paymentMethod: "PIX" } },
      bank,
      rules,
    );
    expect(pix).toMatchObject({ method: "pix", bucket: "sem_categoria", amount_cents: 5000, is_inflow: false });
    const sal = mapTransaction({ id: "t5", date: "2026-11-05", description: "SALARIO", amount: 6900, type: "CREDIT" }, bank, rules);
    expect(sal).toMatchObject({ is_inflow: true, bucket: "ignorar" });
  });

  it("data em UTC à noite cai no dia certo em São Paulo", () => {
    const m = mapTransaction({ id: "t6", date: "2026-11-12T01:30:00.000Z", description: "x", amount: 10, type: "DEBIT" }, card, []);
    expect(m.occurred_on).toBe("2026-11-11");
  });

  it("regras ignoram acento e caixa e preferem o padrão mais longo", () => {
    expect(matchRule("IFOOD *Restaurante", rules)).toBe("mercado");
    expect(matchRule("Farmácia", [{ pattern: "farmacia", bucket: "lazer" }])).toBe("lazer");
    expect(matchRule("nada", rules)).toBeNull();
  });
});

describe("casamento com lançamentos manuais", () => {
  const tx = (id: string, occurred_on: string, reais: number, method: string, description: string) => ({
    id,
    occurred_on,
    amount_cents: Math.round(reais * 100),
    method,
    description,
  });

  it("casa os casos reais de novembro e evita casar crédito com Pix", () => {
    const manual = [
      tx("barbeiro", "2026-11-06", 120, "credito", "Barbeiro"),
      tx("petshop", "2026-11-07", 275, "credito", "Petshop/ração"),
      tx("claude", "2026-11-10", 96, "credito", "Assinatura Claude"),
      tx("cookies", "2026-11-11", 18, "credito", "Cookies"),
    ];
    const bank = [
      tx("b-barb", "2026-11-06", 123.54, "credito", "BARBEARIA CENTRAL LTDA"),
      tx("b-pet", "2026-11-07", 275.02, "credito", "Carla Mendes Rocha"),
      tx("b-claude", "2026-11-07", 117.35, "credito", "ANTHROPIC* CLAUDE SUB"),
      tx("b-pix18", "2026-11-11", 18, "pix", "Transferência enviada|Fulano"),
      tx("b-ifood", "2026-11-07", 146.55, "credito", "IFOOD.COM AGENCIA"),
    ];
    const pairs = Object.fromEntries(matchManual(manual, bank));
    expect(pairs).toEqual({ barbeiro: "b-barb", petshop: "b-pet", claude: "b-claude" });
  });

  it("não casa Mercado R$ 55 com Microsoft 365 R$ 51 (bug real)", () => {
    expect(matchManual([tx("m", "2026-11-10", 55, "credito", "Mercado")], [tx("b", "2026-11-09", 51, "credito", "Microsoft*Microsoft 365 P")])).toEqual([]);
  });

  it("não casa valores muito diferentes sem palavra em comum", () => {
    expect(matchManual([tx("m", "2026-11-07", 161, "credito", "Jantar de sexta")], [tx("b", "2026-11-07", 146.55, "credito", "IFOOD")])).toEqual([]);
  });
  it("vincula cartão da Pluggy ao cartão do seed pelo nome", () => {
    const local = [{ name: "Nubank" }, { name: "Mercado Pago" }];
    expect(findAccountByName(local, "Nubank Ultravioleta Mastercard")?.name).toBe("Nubank");
    expect(findAccountByName(local, "Cartão", "Mercado Pago")?.name).toBe("Mercado Pago");
    expect(findAccountByName(local, "Itaú Click")).toBeUndefined();
  });
});

