import type { MetadataRoute } from "next";

/** Manifesto do app instalado (Safari: Compartilhar → Adicionar à Tela de Início). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Painel de finanças",
    short_name: "Finanças",
    description: "Quanto ainda posso gastar, faturas e o saldo dos próximos meses.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#16171c",
    theme_color: "#16171c",
    lang: "pt-BR",
    icons: [
      { src: "/pwa/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
