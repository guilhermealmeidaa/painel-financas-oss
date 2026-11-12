import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/month-header";
import { loadAll } from "@/lib/data";
import { addMonths, formatMonthShort, monthOf, monthRange, monthsBetween, todayISO } from "@/lib/dates";
import { formatBRL, formatBRLShort } from "@/lib/money";
import { installmentAmountInMonth, installmentEndMonth } from "@/lib/projection";

export default async function ParcelasPage() {
  const data = await loadAll();
  const month = monthOf(todayISO());
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));
  const next12 = monthRange(month, addMonths(month, 11));

  const items = data.installments
    .map((p) => {
      const end = installmentEndMonth(p);
      // parcelas que ainda vão cair a partir deste mês (inclusive)
      const paidBefore = Math.max(0, Math.min(p.installments_count, monthsBetween(p.first_invoice_month, month)));
      const remaining = p.installments_count - paidBefore;
      return { ...p, end, remaining };
    })
    .filter((p) => p.remaining > 0 && p.status !== "quitada");

  const active = items.filter((p) => p.status === "ativa");
  const oldCardByMonth = (m: string) =>
    data.fixed.filter((f) => f.month === m && f.category === "cartao").reduce((s, f) => s + f.amount_cents, 0);
  const totals = next12.map((m) => {
    const fresh = active.reduce((s, p) => s + installmentAmountInMonth(p, m), 0);
    return { month: m, fresh, old: oldCardByMonth(m) };
  });
  const maxTotal = Math.max(...totals.map((t) => t.fresh + t.old), 1);

  return (
    <>
      <PageHeader title="Parcelas" subtitle="Compras parceladas e o total comprometido por mês" />

      <ul className="flex flex-col gap-2">
        {items.map((p) => (
          <li key={p.id}>
            <Card size="sm">
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{p.name}</span>
                    {p.status === "planejada" && <Badge variant="outline">planejada</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.account_id ? accounts.get(p.account_id) : "Cartão não informado"} · {p.remaining} de {p.installments_count}{" "}
                    restantes · termina em {formatMonthShort(p.end)}
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-medium">{formatBRL(p.installment_cents)}</p>
                  <p className="text-xs text-muted-foreground">falta {formatBRLShort(p.installment_cents * p.remaining)}</p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Comprometido nos próximos 12 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-normal">Mês</th>
                <th className="py-1.5 text-right font-normal">Antigas</th>
                <th className="py-1.5 text-right font-normal">Novas</th>
                <th className="py-1.5 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.month} className="border-t border-border">
                  <td className="py-1.5">
                    {formatMonthShort(t.month)}
                    <div className="mt-1 h-1 rounded-full bg-primary" style={{ width: `${((t.fresh + t.old) / maxTotal) * 100}%` }} />
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{t.old ? formatBRLShort(t.old) : "–"}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{t.fresh ? formatBRLShort(t.fresh) : "–"}</td>
                  <td className="py-1.5 text-right font-medium">{formatBRLShort(t.fresh + t.old)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            “Antigas” são os valores de cartão cadastrados nos fixos (só existem até o último mês informado). Compras planejadas não
            entram no total.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
