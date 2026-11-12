import Link from "next/link";
import { ArrowRight, Check, Rocket } from "lucide-react";
import { onboardingStatus } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Faixa no topo da Visão geral enquanto a configuração não terminou:
 * etapas obrigatórias, a próxima a fazer e o atalho para Primeiros passos. Some quando tudo está pronto.
 */
export async function OnboardingBanner() {
  const st = await onboardingStatus(await createClient());
  if (!st.next) return null;
  const required = st.steps.filter((s) => !s.optional);
  return (
    <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6" aria-label="Configuração do painel">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/16 to-primary/4 text-primary ring-1 ring-primary/10 ring-inset">
          <Rocket className="size-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">
            Falta pouco: {st.requiredDone} de {st.requiredTotal} etapas prontas
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Os números ficam certos quando o plano do mês e os bancos estão configurados.
          </p>
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {required.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors",
                    s.done
                      ? "text-muted-foreground ring-border"
                      : s.id === st.next?.id
                        ? "bg-primary/8 text-primary ring-primary/40 hover:bg-primary/12"
                        : "text-foreground ring-border hover:bg-muted",
                  )}
                >
                  {s.done && <Check className="size-3 text-positive" strokeWidth={3} />}
                  {s.title}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Link
        href={st.next.href}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Continuar: {st.next.title} <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
