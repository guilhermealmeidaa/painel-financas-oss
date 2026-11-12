import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_PAGES } from "@/lib/demo-flag";

// Fora do login por sessão: /login; /api/cron (valida CRON_SECRET); /api/mcp (exige token de API pf_…).
const PUBLIC_PATHS = ["/login", "/api/cron", "/api/mcp"];

export async function proxy(request: NextRequest) {
  // modo demonstração (só em dev, dados inventados): não exige login nem fala com o Supabase
  // As outras páginas leem o Supabase direto (dados reais, já que o login do navegador vale em qualquer porta):
  // no modo demo elas voltam para o início, e nenhuma rota de API funciona (nada é lido nem gravado).
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1" && process.env.NODE_ENV !== "production") {
    const p = request.nextUrl.pathname;
    if (p.startsWith("/api/")) return NextResponse.json({ error: "modo demonstração" }, { status: 403 });
    if (!DEMO_PAGES.includes(p)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
  // Instalação nova, sem Supabase configurado: nem o login funciona. Tudo vai para /configurar,
  // que explica o passo a passo (página pública que só diz quais variáveis faltam, nunca os valores).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const p = request.nextUrl.pathname;
    if (p.startsWith("/api/")) return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 });
    if (p === "/configurar") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/configurar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Valida o JWT (getClaims verifica a assinatura) e renova a sessão se preciso.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isLoggedIn && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
