/**
 * Bancos reconhecidos pelo nome do cartão/conta: cor do "cartão" visual e logo.
 * Basta o nome conter um dos apelidos (sem acento, sem diferenciar maiúsculas):
 * "Nubank Ultravioleta", "Cartão Itaú", "itau personnalite"… Renomeie o cartão para o
 * nome do banco e a logo aparece.
 *
 * `icon`: símbolo do Simple Icons (lib/bank-icons.ts). Sem símbolo livre: o nome escrito
 * no estilo da marca (`wordmark`). As marcas pertencem aos respectivos bancos.
 */
export interface Bank {
  id: string;
  name: string;
  aliases: string[];
  bg: string;
  fg?: string;
  icon?: string;
  wordmark?: { text: string; className: string };
}

const grad = (a: string, b: string, c: string) => `linear-gradient(140deg,${a} 0%,${b} 55%,${c} 100%)`;

export const BANKS: Bank[] = [
  { id: "nubank", name: "Nubank", aliases: ["nubank", "nu pagamentos", "nuconta"], bg: grad("#9b2fe0", "#6c13b3", "#4b0a83"), icon: "nubank" },
  { id: "inter", name: "Inter", aliases: ["banco inter", "inter"], bg: grad("#ff9a3c", "#ff7a00", "#e05e00"), wordmark: { text: "inter", className: "text-[21px] font-extrabold tracking-[-0.06em] lowercase" } },
  { id: "santander", name: "Santander", aliases: ["santander"], bg: grad("#f2393a", "#d70f12", "#a00a0c"), wordmark: { text: "Santander", className: "text-[16px] font-bold tracking-[-0.02em]" } },
  { id: "mercadopago", name: "Mercado Pago", aliases: ["mercado pago", "mercadopago"], bg: grad("#2bb5f0", "#0a8fd8", "#0567a8"), icon: "mercadopago" },
  { id: "itau", name: "Itaú", aliases: ["itau", "personnalite", "iti"], bg: grad("#ff8a1f", "#ec7000", "#c45a00"), wordmark: { text: "itaú", className: "text-[19px] font-black tracking-[-0.04em] lowercase" } },
  { id: "bradesco", name: "Bradesco", aliases: ["bradesco", "next"], bg: grad("#e8264b", "#cc092f", "#9a0622"), wordmark: { text: "bradesco", className: "text-[17px] font-bold tracking-[-0.03em] lowercase" } },
  { id: "bb", name: "Banco do Brasil", aliases: ["banco do brasil", "ourocard", "bb"], bg: grad("#fde047", "#fcd800", "#e6c200"), fg: "#1f3d8a", wordmark: { text: "BB", className: "text-[20px] font-black tracking-[-0.04em]" } },
  { id: "caixa", name: "Caixa", aliases: ["caixa"], bg: grad("#1f6fd1", "#005ca9", "#00427a"), wordmark: { text: "CAIXA", className: "text-[17px] font-black tracking-[0.02em]" } },
  { id: "c6", name: "C6 Bank", aliases: ["c6"], bg: grad("#3a3d42", "#242528", "#0f1012"), wordmark: { text: "C6", className: "text-[20px] font-black tracking-[-0.02em]" } },
  { id: "btg", name: "BTG Pactual", aliases: ["btg"], bg: grad("#1b3d75", "#0b2a5b", "#061a3a"), wordmark: { text: "btg pactual", className: "text-[15px] font-bold tracking-[-0.02em] lowercase" } },
  { id: "xp", name: "XP", aliases: ["xp investimentos", "xp visa", "cartao xp", "xp"], bg: grad("#2b2b2b", "#141414", "#000000"), wordmark: { text: "XP", className: "text-[20px] font-black tracking-[-0.02em]" } },
  { id: "picpay", name: "PicPay", aliases: ["picpay"], bg: grad("#3ddc84", "#21c25e", "#119a45"), icon: "picpay" },
  { id: "pagbank", name: "PagBank", aliases: ["pagbank", "pagseguro"], bg: grad("#4ade80", "#1cb954", "#0f8a3c"), icon: "pagbank" },
  { id: "neon", name: "Neon", aliases: ["banco neon", "neon"], bg: grad("#22d3ee", "#00a5d8", "#0077b6"), wordmark: { text: "neon", className: "text-[19px] font-bold tracking-[-0.04em] lowercase" } },
  { id: "will", name: "Will Bank", aliases: ["will bank", "willbank"], bg: grad("#fff04d", "#ffe600", "#e6cf00"), fg: "#1c1c1c", wordmark: { text: "will", className: "text-[20px] font-black tracking-[-0.04em] lowercase" } },
  { id: "pan", name: "Banco Pan", aliases: ["banco pan", "pan"], bg: grad("#2b9bff", "#0079e6", "#0055a8"), wordmark: { text: "pan", className: "text-[20px] font-black tracking-[-0.04em] lowercase" } },
  { id: "sicredi", name: "Sicredi", aliases: ["sicredi"], bg: grad("#5cc75a", "#3fa535", "#2a7d24"), wordmark: { text: "Sicredi", className: "text-[17px] font-bold tracking-[-0.02em]" } },
  { id: "sicoob", name: "Sicoob", aliases: ["sicoob"], bg: grad("#0e8a7d", "#006d63", "#004c45"), wordmark: { text: "Sicoob", className: "text-[17px] font-bold tracking-[-0.02em]" } },
  { id: "original", name: "Original", aliases: ["banco original"], bg: grad("#36d07b", "#00a859", "#007a40"), wordmark: { text: "original", className: "text-[17px] font-bold tracking-[-0.03em] lowercase" } },
  { id: "safra", name: "Safra", aliases: ["safra"], bg: grad("#2a3f6b", "#16284d", "#0b1730"), wordmark: { text: "Safra", className: "text-[17px] font-semibold tracking-[0.04em]" } },
  { id: "banrisul", name: "Banrisul", aliases: ["banrisul"], bg: grad("#2079c7", "#005ca9", "#003f78"), wordmark: { text: "banrisul", className: "text-[17px] font-bold tracking-[-0.02em] lowercase" } },
  { id: "digio", name: "Digio", aliases: ["digio"], bg: grad("#2c64d6", "#0c45b8", "#082f80"), wordmark: { text: "digio", className: "text-[19px] font-bold tracking-[-0.03em] lowercase" } },
  { id: "nomad", name: "Nomad", aliases: ["nomad"], bg: grad("#3a3a3a", "#1f1f1f", "#0a0a0a"), wordmark: { text: "nomad", className: "text-[18px] font-bold tracking-[-0.03em] lowercase" } },
  { id: "agibank", name: "Agibank", aliases: ["agibank"], bg: grad("#2fb5ff", "#0095e8", "#006bb0"), wordmark: { text: "agibank", className: "text-[17px] font-bold tracking-[-0.03em] lowercase" } },
  { id: "n26", name: "N26", aliases: ["n26"], bg: grad("#5bc4b0", "#48ac98", "#2f7f6f"), icon: "n26" },
  { id: "revolut", name: "Revolut", aliases: ["revolut"], bg: grad("#3a3f44", "#191c1f", "#000000"), icon: "revolut" },
  { id: "wise", name: "Wise", aliases: ["wise"], bg: grad("#b6f08f", "#9fe870", "#7cc94d"), fg: "#163300", icon: "wise" },
  { id: "paypal", name: "PayPal", aliases: ["paypal"], bg: grad("#1e4bd1", "#002991", "#001c66"), icon: "paypal" },
  { id: "amex", name: "American Express", aliases: ["american express", "amex"], bg: grad("#4b93d6", "#2e77bc", "#1d548a"), icon: "amex" },
];

const norm = (s: string) =>
  ` ${s}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") + " ";

/** Banco pelo nome do cartão/conta, ou null. Casa palavra inteira: "Cartão Inter" sim, "Internacional" não. */
export function bankFor(name: string | null | undefined): Bank | null {
  if (!name) return null;
  const n = norm(name);
  return BANKS.find((b) => b.aliases.some((a) => n.includes(` ${norm(a).trim()} `))) ?? null;
}

/** Cor do "cartão" visual: do banco reconhecido, ou grafite. Pseudo-cartões (plano/reserva) ficam claros. */
export function cardStyle(name: string | null): { bg: string; fg: string } {
  const n = (name ?? "").toLowerCase();
  if (n.includes("plano") || n.includes("reserva")) return { bg: "linear-gradient(140deg,#eef0f4 0%,#dfe3ea 100%)", fg: "#1f2633" };
  const b = bankFor(name);
  if (b) return { bg: b.bg, fg: b.fg ?? "#fff" };
  return { bg: "linear-gradient(140deg,#4a4e58 0%,#2b2e35 50%,#17191d 100%)", fg: "#fff" };
}
