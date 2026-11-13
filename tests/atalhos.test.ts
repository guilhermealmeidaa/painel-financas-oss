import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseCategoria, parseValor, weekendList } from "@/lib/atalhos";

describe("atalhos do iPhone", () => {
  it("valor falado ou digitado vira centavos", () => {
    expect(parseValor("30")).toBe(3000);
    expect(parseValor("30,50")).toBe(3050);
    expect(parseValor("R$ 1.234,56")).toBe(123456);
    expect(parseValor(42.5)).toBe(4250);
    expect(parseValor("trinta")).toBeNull();
    expect(parseValor(null)).toBeNull();
  });
  it("categoria falada", () => {
    expect(parseCategoria("Lazer")).toBe("lazer");
    expect(parseCategoria("Saídas", { label_lazer: "Saídas", label_mercado: "Casa" })).toBe("lazer");
    expect(parseCategoria("mercado")).toBe("mercado");
    expect(parseCategoria("Assinatura")).toBe("assinatura");
    expect(parseCategoria("outra coisa")).toBeNull();
  });
  it("lista de fins de semana para a Siri", () => {
    expect(weekendList(["2026-11-14", "2026-11-28"])).toBe("14/11 e 28/11");
    expect(weekendList(["2026-12-05", "2026-12-12", "2026-12-19"])).toBe("05/12, 12/12 e 19/12");
    expect(weekendList([])).toBe("");
  });
});
