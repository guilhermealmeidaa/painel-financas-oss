import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Painel de finanças",
  description: "Quanto ainda posso gastar, quanto vem de fatura e o saldo dos próximos meses.",
  robots: { index: false, follow: false },
  applicationName: "Finanças",
  // app instalado no iPhone: tela cheia, barra de status sobre o conteúdo (o layout respeita a área segura)
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/pwa/icon/180", sizes: "180x180", type: "image/png" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#16171c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
