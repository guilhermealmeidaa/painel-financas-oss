/** Texto amigável para o motivo de uma decisão automática. */
export function reasonLabel(reason: string): string {
  if (reason.startsWith("regra:")) return `Regra “${reason.slice(6)}”`;
  return (
    {
      pix_no_credito: "Pix no crédito (lado da conta)",
      pix_no_credito_taxa: "Compra de Pix no crédito",
      pagamento_fatura: "Pagamento de fatura",
      transferencia_propria: "Transferência para você mesmo",
      iof_herdado: "IOF/juros da compra",
      categoria_banco: "Categoria do banco",
      juntado_manual: "Juntado com seu lançamento",
      parcela: "Parcela",
      parcela_da_serie: "Continuação de uma compra parcelada",
    } as Record<string, string>
  )[reason] ?? reason;
}

/** Agrupa "regra:X" em um só grupo "Regras" para a lista não ficar enorme. */
export const reasonGroup = (reason: string) => (reason.startsWith("regra:") ? "regras" : reason);
