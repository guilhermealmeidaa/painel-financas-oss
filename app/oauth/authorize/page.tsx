import { connection } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bot, TriangleAlert } from "lucide-react";
import { AUTHORIZE_PARAMS, checkAuthorize } from "@/lib/oauth-authorize";
import { resourceOf } from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

// rota bloqueante: valida o pedido antes de responder, e um erro vira redirecionamento HTTP de verdade
export const instant = false;

/**
 * Tela de consentimento do conector do Claude. O proxy já exige login (e volta para cá depois dele,
 * com todos os parâmetros). Mostra o domínio do callback e só concede escrita se você marcar.
 */
export default async function AuthorizePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await props.searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const check = checkAuthorize(get, origin, resourceOf(origin));
  if (!check.ok && "redirect" in check) redirect(check.redirect);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const email = (auth?.claims?.email as string | undefined) ?? "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      {!check.ok ? (
        <div className="surface flex flex-col gap-2 p-5">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert className="size-5 text-destructive" /> Não deu para conectar
          </h1>
          <p className="text-sm text-muted-foreground">{check.fatal}</p>
        </div>
      ) : (
        <form method="post" action="/oauth/authorize/decision" className="surface flex flex-col gap-4 p-5">
          {AUTHORIZE_PARAMS.map((k) => {
            const v = get(k);
            return v != null ? <input key={k} type="hidden" name={k} value={v} /> : null;
          })}
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="size-5" /> Conectar ao {check.req.clientName}?
          </h1>
          <p className="text-sm">
            O <strong>{check.req.clientName}</strong> quer acessar o seu painel de finanças
            {email ? (
              <>
                {" "}
                como <strong>{email}</strong>
              </>
            ) : null}
            .
          </p>
          <div className="rounded-xl bg-muted/70 p-3 text-sm">
            <p>
              Depois de autorizar, você volta para <strong className="font-mono">{new URL(check.req.redirectUri).host}</strong>.
            </p>
            {new URL(check.req.redirectUri).hostname.match(/^(localhost|127\.0\.0\.1)$/) && (
              <p className="mt-2 text-xs text-destructive">
                Este endereço é um programa no seu computador (ex.: Claude Code). Autorize só se foi você que iniciou a conexão agora.
              </p>
            )}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            <li>✓ Ler saldos, gastos, faturas, parcelas e a projeção</li>
            <li className="text-muted-foreground">✗ Nunca edita nem apaga nada</li>
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="write" value="1" defaultChecked={check.req.scopes.includes("write")} className="mt-0.5 size-4 accent-primary" />
            <span>
              Permitir lançar gastos
              <span className="block text-xs text-muted-foreground">Libera só a ferramenta lancar_gasto, que cria um gasto manual.</span>
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" name="decision" value="deny" className="h-11 flex-1 rounded-xl border border-border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button type="submit" name="decision" value="allow" className="h-11 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:opacity-90">
              Autorizar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Dá para revogar quando quiser em Acesso do Claude.</p>
        </form>
      )}
    </main>
  );
}
