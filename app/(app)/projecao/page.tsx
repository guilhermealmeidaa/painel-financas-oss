import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectionChart } from "@/components/projection-chart";
import { PageHeader } from "@/components/month-header";
import { loadAll, runProjection } from "@/lib/data";
import { formatMonthShort } from "@/lib/dates";
import { formatBRLShort } from "@/lib/money";
import { LOW_BALANCE_CENTS } from "@/lib/projection";
import { cn } from "@/lib/utils";

export default async function ProjecaoPage(props: PageProps<"/projecao">) {
  const sp = await props.searchParams;
  const includePlanned = sp.planejadas === "1";
  const data = await loadAll();
  const rows = runProjection(data, includePlanned);
  const planned = data.installments.filter((i) => i.status === "planejada");

  const lines: { key: keyof (typeof rows)[number]; label: string; sign: 1 | -1 }[] = [
    { key: "income", label: "Entra", sign: 1 },
    { key: "fixed", label: "Fixos (fora do cartão)", sign: -1 },
    { key: "creditInvoice", label: "Faturas dos cartões", sign: -1 },
    { key: "extras", label: "Fixos avulsos e assinaturas (conta)", sign: -1 },
    { key: "daily", label: "Dia a dia (débito/Pix)", sign: -1 },
    { key: "net", label: "Resultado do mês", sign: 1 },
  ];

  return (
    <>
      <PageHeader title="Projeção" subtitle="Saldo na conta mês a mês, com fixos, faturas, parcelas e dia a dia" />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Saldo no fim do mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectionChart
            points={rows.map((r) => ({ label: formatMonthShort(r.month), balance: r.balance }))}
            minCents={LOW_BALANCE_CENTS}
          />
        </CardContent>
      </Card>

      {planned.length > 0 && (
        <Link
          href={includePlanned ? "/projecao" : "/projecao?planejadas=1"}
          className="surface rounded-[14px] px-5 py-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {includePlanned ? "✓ Incluindo" : "Incluir"} compras planejadas: {planned.map((p) => p.name).join(", ")}
        </Link>
      )}

      <Card size="sm">
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[480px] text-[13px] whitespace-nowrap tabular-nums">
            <thead>
              <tr className="text-[12px] text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-2.5 text-left font-normal" />
                {rows.map((r) => (
                  <th key={r.month} className="px-3 py-2.5 text-right font-medium capitalize">
                    {formatMonthShort(r.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className={cn("border-t border-border/70", l.key === "net" && "font-semibold")}>
                  <th className="sticky left-0 z-10 bg-card px-5 py-2.5 text-left font-normal text-muted-foreground">{l.label}</th>
                  {rows.map((r) => {
                    const v = (r[l.key] as number) * l.sign;
                    return (
                      <td key={r.month} className="px-3 py-2.5 text-right">
                        {l.key === "net" && r.alerts.negativeMonth ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertTriangle className="size-3.5" aria-label="Mês negativo" />
                            {formatBRLShort(v)}
                          </span>
                        ) : r[l.key] === 0 ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          formatBRLShort(v)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-bold">
                <th className="sticky left-0 z-10 bg-muted px-5 py-3 text-left">Saldo no fim</th>
                {rows.map((r) => (
                  <td key={r.month} className={cn("px-3 py-3 text-right", r.alerts.lowBalance && "text-destructive")}>
                    {r.alerts.lowBalance && <AlertTriangle className="mr-1 inline size-3.5" aria-label="Abaixo do mínimo" />}
                    {formatBRLShort(r.balance)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ul className="flex flex-col gap-1.5 px-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {rows.some((r) => r.alerts.negativeMonth) && (
          <li>
            <AlertTriangle className="mr-1 inline size-3.5 text-destructive" />
            Mês negativo sozinho: {rows.filter((r) => r.alerts.negativeMonth).map((r) => formatMonthShort(r.month)).join(", ")}. O
            saldo do mês anterior precisa cobrir.
          </li>
        )}
        {rows.some((r) => r.alerts.lowBalance) && (
          <li>
            <AlertTriangle className="mr-1 inline size-3.5 text-destructive" />
            Saldo abaixo de {formatBRLShort(LOW_BALANCE_CENTS)} em{" "}
            {rows.filter((r) => r.alerts.lowBalance).map((r) => formatMonthShort(r.month)).join(", ")}.
          </li>
        )}
        {rows.some((r) => r.opening != null) && (
          <li>
            {(() => {
              const a = rows.find((r) => r.opening != null)!;
              return `${formatMonthShort(a.month)} parte do saldo real de hoje nas contas (${formatBRLShort(a.opening!)}) e mostra só o que ainda falta: entradas a receber, fixos e faturas não pagos e o dia a dia no débito/Pix que falta gastar.`;
            })()}
          </li>
        )}
        <li>Faturas: cartão ligado ao banco usa as compras reais (e a fatura fechada, quando existe); os outros usam estimativa. Dia a dia conta o maior entre o teto e o que já foi gasto.</li>
      </ul>
    </>
  );
}
