import { describe, expect, it } from "vitest";
import { bankFor } from "@/lib/banks";

describe("banco pelo nome do cartão", () => {
  it.each([
    ["Nubank", "nubank"],
    ["Nubank Ultravioleta", "nubank"],
    ["Cartão Inter", "inter"],
    ["Inter", "inter"],
    ["Itaú Personnalité", "itau"],
    ["itau", "itau"],
    ["Mercado Pago", "mercadopago"],
    ["Banco do Brasil Ourocard", "bb"],
    ["C6 Carbon", "c6"],
    ["Santander SX", "santander"],
  ])("%s → %s", (name, id) => expect(bankFor(name)?.id).toBe(id));

  it.each(["Internacional", "platinum", "Cartão", "Conta corrente"])("%s → nenhum", (name) => expect(bankFor(name)).toBeNull());
});
