import { ImageResponse } from "next/og";

/**
 * Ícones do app instalado (PWA), desenhados na hora: a mesma marca da barra lateral (três barras subindo).
 * /pwa/icon/180 (iPhone), /pwa/icon/192, /pwa/icon/512 e /pwa/icon/maskable (Android, com margem de segurança).
 */
const SIZES: Record<string, { px: number; inset: number }> = {
  "180": { px: 180, inset: 0.22 },
  "192": { px: 192, inset: 0.22 },
  "512": { px: 512, inset: 0.22 },
  maskable: { px: 512, inset: 0.3 },
};

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const s = SIZES[size];
  if (!s) return new Response("not found", { status: 404 });
  const pad = Math.round(s.px * s.inset);
  const area = s.px - pad * 2;
  const bar = Math.round(area * 0.24);
  const gap = Math.round((area - bar * 3) / 2);
  const radius = Math.round(bar * 0.34);
  const heights = [0.5, 0.77, 1];
  const opacity = [0.6, 0.8, 1];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap,
          padding: pad,
          background: "linear-gradient(135deg, #3f6ff0 0%, #2a3fb8 100%)",
        }}
      >
        {heights.map((h, i) => (
          <div key={i} style={{ width: bar, height: Math.round(area * h), borderRadius: radius, background: "white", opacity: opacity[i] }} />
        ))}
      </div>
    ),
    { width: s.px, height: s.px, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
