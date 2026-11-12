const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** 83300 -> "R$ 833,00" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** 83300 -> "R$ 833" (sem centavos, para cards e gráficos) */
export function formatBRLShort(cents: number): string {
  return brlCompact.format(Math.round(cents / 100));
}

/**
 * Converte o que o usuário digitou ("49", "18,70", "1.500,00", "137.48") em centavos.
 * Retorna null se não for um valor válido.
 */
export function parseBRLToCents(input: string): number | null {
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    // formato brasileiro: ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.500" = mil e quinhentos
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}
