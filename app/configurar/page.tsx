import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { serverSetup } from "@/lib/setup-status";
import { cn } from "@/lib/utils";

/**
 * Tela de instalação: aparece (sem login) enquanto o Supabase não está configurado,
 * porque sem ele nem o login funciona. Mostra só SE cada variável existe, nunca o valor.
 * Depois de configurado, leva para "Primeiros passos" (com login).
 */
function Block({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="surface flex gap-4 p-5 sm:p-6">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold",
          done ? "bg-positive text-white" : "bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset",
        )}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-[13.5px] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline [&_b]:font-semibold [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:text-foreground">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </li>
  );
}

async function Content() {
  await connection();
  const setup = serverSetup();
  const ok = (k: string) => setup.items.find((i) => i.key === k)?.ok ?? false;
  if (ok("NEXT_PUBLIC_SUPABASE_URL") && ok("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) redirect("/primeiros-passos");

  return (
    <ol className="flex flex-col gap-3">
      <Block n={1} title="Crie o banco de dados no Supabase" done={ok("NEXT_PUBLIC_SUPABASE_URL")}>
        <p>
          Crie um projeto grátis em <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>. Depois, no{" "}
          <b>SQL Editor</b>, cole e rode o arquivo <code>supabase/migrations/20260101000000_schema.sql</code> deste repositório: ele cria
          as tabelas, já protegidas para que cada usuário só veja os próprios dados.
        </p>
        <p>
          Em <b>Authentication → Users → Add user</b>, crie o seu usuário (e-mail e senha). Em <b>Sign In / Providers</b>, desligue{" "}
          <i>Allow new users to sign up</i>: o painel é só seu.
        </p>
      </Block>

      <Block n={2} title="Pegue as chaves da Pluggy" done={ok("PLUGGY_CLIENT_ID") && ok("PLUGGY_CLIENT_SECRET")}>
        <p>
          A <b>Pluggy</b> é quem conversa com os bancos (Open Finance). Em{" "}
          <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">dashboard.pluggy.ai</a>, crie uma <b>Application</b> e copie
          o Client ID e o Client Secret. Em <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">meu.pluggy.ai</a>, autorize os
          bancos que você usa.
        </p>
      </Block>

      <Block n={3} title="Preencha o .env.local">
        <p>Na pasta do projeto, copie o modelo e preencha com as chaves dos passos 1 e 2:</p>
        <pre>cp .env.example .env.local</pre>
        <ul className="flex flex-col gap-1">
          {setup.items.map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              {i.ok ? (
                <Check className="size-4 shrink-0 text-positive" strokeWidth={2.5} />
              ) : (
                <Circle className={cn("size-4 shrink-0", i.required ? "text-warning" : "text-muted-foreground/50")} />
              )}
              <code>{i.key}</code>
              <span className="truncate">{i.label}</span>
              {!i.required && <span className="text-[12px]">(opcional)</span>}
            </li>
          ))}
        </ul>
        <p>
          As chaves da Pluggy, a chave secreta do Supabase e o <code>CRON_SECRET</code> ficam só no servidor; nunca coloque o prefixo{" "}
          <code>NEXT_PUBLIC_</code> nelas.
        </p>
      </Block>

      <Block n={4} title="Reinicie e entre">
        <p>O Next só lê o <code>.env.local</code> ao iniciar:</p>
        <pre>npm run dev</pre>
        <p>
          Recarregue esta página: ela vira a tela de login. Entre com o usuário do passo 1 e siga a tela <b>Primeiros passos</b>, que guia o
          resto (preferências, plano do mês, conectar bancos e triagem).
        </p>
      </Block>
    </ol>
  );
}

export default function ConfigurarPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:py-12">
      <header className="flex items-center gap-3">
        <BrandMark className="size-11" />
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.03em] sm:text-[28px]">Vamos configurar o seu painel</h1>
          <p className="text-[13.5px] text-muted-foreground">Uns 15 minutos. Você precisa de uma conta no Supabase e outra na Pluggy.</p>
        </div>
      </header>
      <div className="surface flex flex-col gap-1 p-5 text-[13.5px] leading-relaxed text-muted-foreground sm:p-6">
        <p>
          O painel junta <b className="text-foreground">o seu plano</b> (quanto entra, os fixos e o teto do dia a dia) com{" "}
          <b className="text-foreground">os dados reais dos seus bancos</b>, e mostra quanto ainda dá para gastar no mês, quanto vem de fatura e
          o saldo dos próximos meses. Tudo fica no seu próprio banco de dados.
        </p>
        <p>
          Só quer ver como fica? Rode <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">npm run demo</code> e abra{" "}
          <span className="text-foreground">localhost:3001</span>, com dados inventados.
        </p>
      </div>
      <Suspense fallback={<div className="surface h-64 animate-pulse" />}>
        <Content />
      </Suspense>
    </main>
  );
}
