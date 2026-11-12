import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // modo demonstração roda em paralelo ao dev normal, em outra pasta de build
  ...(process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? { distDir: ".next-demo" } : {}),
  // Abrir o servidor de dev pelo celular na rede local: DEV_ORIGINS=192.168.0.10 (separe vários por vírgula).
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
