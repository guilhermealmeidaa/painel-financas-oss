import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, Check, Circle, Rocket } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { Panel } from "@/components/panel";
import { PreferencesEditor } from "@/components/plan/plan-editors";
import { bucketLabels } from "@/lib/labels";
import { onboardingStatus, type StepId } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function Step({
  id,
  n,
  done,
  optional,
  title,
  children,
  action,
}: {
  id: string;
  n: number;
  done: boolean;
  optional?: boolean;
  title: string;
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <li id={id} className="surface flex scroll-mt-4 gap-4 p-5 sm:p-6">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold",
          done ? "bg-positive text-white" : "bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset",
        )}
        aria-label={done ? "feito" : "a fazer"}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {title}
          {optional && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">opcional</span>}
          {done && <span className="text-[12px] font-medium text-positive">feito</span>}
        </h2>
        <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-foreground">
          {children}
        </div>
        {action && (
          <Link
            href={action.href}
            className="mt-1 inline-flex items-center gap-1.5 self-start rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {action.label} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

async function Steps() {
  await connection();
  const supabase = await createClient();
  const st = await onboardingStatus(supabase);
  const { settings, setup, pending } = st;
  const done = (id: StepId) => st.steps.find((x) => x.id === id)!.done;
  const labels = bucketLabels(settings);
  const pct = Math.round((st.requiredDone / st.requiredTotal) * 100);

  return (
    <>
    <section className="surface flex flex-col gap-3 p-5 sm:p-6" aria-label="Progresso">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">
          {st.next ? `${st.requiredDone} de ${st.requiredTotal} etapas prontas` : "Tudo pronto. O painel já está trabalhando com os seus dados."}
        </p>
        {st.next && (
          <a href={st.next.href} className="text-[13px] font-semibold text-primary hover:underline">
            Próxima: {st.next.title}
          </a>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full", st.next ? "bg-primary" : "bg-positive")} style={{ width: `${pct}%` }} />
      </div>
    </section>
    <ol className="flex flex-col gap-3">
      <Step id="servidor" n={1} done={done("servidor")} title="Ligue o servidor ao Supabase e à Pluggy">
        <p>
          O painel guarda tudo no seu próprio projeto do <b>Supabase</b> e busca os extratos pela <b>Pluggy</b> (Open Finance). As chaves
          ficam só no servidor, no arquivo <code>.env.local</code> (ou nas variáveis de ambiente da Vercel). O passo a passo completo está no
          README.
        </p>
        <ul className="flex flex-col gap-1">
          {setup.items.map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              {i.ok ? <Check className="size-4 text-positive" strokeWidth={2.5} /> : <Circle className={cn("size-4", i.required ? "text-warning" : "text-muted-foreground/50")} />}
              <code>{i.key}</code>
              <span className="truncate">{i.label}</span>
              {!i.ok && !i.required && <span className="text-[12px]">(opcional)</span>}
            </li>
          ))}
        </ul>
      </Step>

      <Step id="preferencias" n={2} done={done("preferencias")} title="Conte quem é você e como chama seus gastos do dia a dia">
        <p>
          O dia a dia tem duas categorias com teto: hoje elas se chamam <b>{labels.lazer}</b> e <b>{labels.mercado}</b>. Seu nome e CPF/CNPJ
          servem só para reconhecer Pix entre as suas próprias contas, que não são gasto.
        </p>
        <div className="max-w-xl rounded-[14px] bg-muted/50 p-4">
          <PreferencesEditor
            initial={{
              label_lazer: labels.lazer,
              label_mercado: labels.mercado,
              self_names: settings?.self_names ?? [],
              self_tax_ids: settings?.self_tax_ids ?? [],
            }}
          />
        </div>
      </Step>

      <Step
        id="plano"
        n={3}
        done={done("plano")}
        title="Monte o plano do mês"
        action={{ href: "/planejamento", label: "Abrir Planejamento" }}
      >
        <p>
          Em <b>Planejamento</b>, cadastre o que entra (salário, freelas), os <b>fixos</b> (aluguel, contas, empréstimos, financiamentos) e o{" "}
          <b>teto do dia a dia</b>, dividido entre {labels.lazer.toLowerCase()} e {labels.mercado.toLowerCase()}. Use “repetir por N meses”
          para não digitar tudo de novo: a projeção vai até o último mês que tiver plano.
        </p>
      </Step>

      <Step id="bancos" n={4} done={done("bancos")} title="Conecte seus bancos" action={{ href: "/conexoes", label: "Abrir Conexões" }}>
        <p>
          Primeiro, entre em <b>meu.pluggy.ai</b> e autorize lá cada banco que você usa. Depois, em <b>Conexões</b>, toque em{" "}
          <b>Conectar com Meu Pluggy</b> e entre com a mesma conta. O painel puxa contas, cartões, faturas e os lançamentos dos últimos 90
          dias.
        </p>
        <p>
          Os cartões às vezes chegam com o nome do produto (“Platinum”, “Gold”). Renomeie para o nome do banco — <b>Nubank</b>, <b>Itaú</b>,{" "}
          <b>Inter</b>… — e a cor e a logo aparecem. Se você já tinha cadastrado o cartão à mão, use <b>“É o meu…”</b> para juntar os dois.
        </p>
      </Step>

      <Step
        id="triagem"
        n={5}
        done={done("triagem")}
        title="Revise a triagem"
        action={{ href: "/triagem", label: pending > 0 ? `Classificar ${pending} gastos` : "Abrir Triagem" }}
      >
        <p>
          O painel classifica sozinho o que consegue (pagamento de fatura, transferências suas, IOF, regras) e mostra o motivo de cada
          decisão; tudo pode ser desfeito. O que sobrar sem categoria fica na <b>Triagem</b>: escolha {labels.lazer.toLowerCase()},{" "}
          {labels.mercado.toLowerCase()}, fixo, assinatura, parcela ou ignorar. Crie <b>regras</b> para os próximos virem certos.
        </p>
      </Step>

      <Step id="sync" n={6} done={done("sync")} optional title="Deixe o sync automático">
        <p>
          Publicado na <b>Vercel</b>, o painel sincroniza 1 vez por dia sozinho (plano grátis). Para sincronizar a cada 3 horas, o repositório
          já traz o workflow <code>.github/workflows/sync.yml</code>: cadastre o segredo <code>CRON_SECRET</code> e a variável <code>APP_URL</code>{" "}
          no GitHub. A qualquer hora dá para usar <b>Conexões → Sincronizar agora</b>.
        </p>
      </Step>

      <Step id="claude" n={7} done={done("claude")} optional title="Converse com o Claude sobre as suas finanças" action={{ href: "/acesso-claude", label: "Gerar token" }}>
        <p>
          O painel tem um servidor MCP <b>somente leitura</b>. Gere um token em <b>Acesso do Claude</b> e adicione o conector no Claude
          (instruções em <code>docs/mcp.md</code>). Ele vê saldo, faturas e projeção, mas não muda nada.
        </p>
      </Step>
    </ol>
    </>
  );
}

export default function PrimeirosPassosPage() {
  return (
    <>
      <PageHeader title="Primeiros passos" subtitle="Do zero ao painel funcionando, em sete etapas" />
      <Panel title="Como o painel funciona" icon={Rocket}>
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
          Você conta o plano (quanto entra, os fixos e o teto do dia a dia) e o painel junta isso com os dados reais dos bancos: fatura de cada
          cartão, parcelas que ainda vão cair e o que já saiu. Com isso ele mostra quanto ainda dá para gastar no mês e o saldo previsto nos
          próximos meses.
        </p>
      </Panel>
      <Suspense fallback={<div className="surface h-48 animate-pulse" />}>
        <Steps />
      </Suspense>
    </>
  );
}
