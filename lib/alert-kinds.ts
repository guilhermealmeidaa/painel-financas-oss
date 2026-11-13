/** Tipos de aviso por push e os textos da tela de Notificações (sem dependências de servidor). */
export type AlertKind = "contas" | "ritmo" | "sync" | "assinaturas" | "fora_do_padrao";
export const ALERT_KINDS: { key: AlertKind | "resumo_diario"; label: string; hint: string }[] = [
  { key: "contas", label: "Contas que o saldo não cobre", hint: "fatura ou fixo nos próximos 3 dias sem saldo previsto" },
  { key: "ritmo", label: "Dia a dia no limite", hint: "quando sobra menos de 20% do teto e quando passa dele" },
  { key: "sync", label: "Banco sem atualizar", hint: "conexão com erro ou sem sync há mais de 30 horas" },
  { key: "assinaturas", label: "Assinatura mais cara", hint: "cobrança acima do valor anterior" },
  { key: "fora_do_padrao", label: "Gasto fora do padrão", hint: "valor bem acima do normal, cobrança repetida, primeira compra alta" },
  { key: "resumo_diario", label: "Resumo do dia às 21h", hint: "quanto saiu hoje e quanto ainda dá para gastar" },
];
