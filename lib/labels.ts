import type { Enums } from "./database.types";

export const BUCKET_LABEL: Record<Enums<"bucket">, string> = {
  // nomes padrão; cada pessoa pode trocar no Planejamento (settings.label_lazer / label_mercado)
  lazer: "Lazer",
  mercado: "Mercado",
  fixo: "Fixo",
  assinatura: "Assinatura",
  parcela: "Parcela",
  ignorar: "Ignorar",
  sem_categoria: "Sem categoria",
};

export const METHOD_LABEL: Record<Enums<"payment_method">, string> = {
  credito: "Crédito",
  debito: "Débito",
  pix: "Pix",
};

/** Rótulos com os nomes que a pessoa deu às duas categorias do dia a dia (padrão: Lazer e Mercado). */
export function bucketLabels(settings?: { label_lazer?: string | null; label_mercado?: string | null } | null): Record<Enums<"bucket">, string> {
  return {
    ...BUCKET_LABEL,
    lazer: settings?.label_lazer?.trim() || BUCKET_LABEL.lazer,
    mercado: settings?.label_mercado?.trim() || BUCKET_LABEL.mercado,
  };
}
