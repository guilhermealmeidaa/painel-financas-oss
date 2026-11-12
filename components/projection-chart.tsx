"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatBRLShort } from "@/lib/money";

// Série única (saldo no fim do mês) em azul; abaixo do mínimo usa o vermelho de status.
// A tabela abaixo do gráfico repete o alerta com ícone e texto (nunca só cor).
const SERIES = "var(--chart-1)";
const CRITICAL = "var(--destructive)";
const GRID = "var(--border)";
const AXIS = "var(--muted-foreground)";

export interface ChartPoint {
  label: string;
  balance: number; // centavos
}

export function ProjectionChart({ points, minCents }: { points: ChartPoint[]; minCents: number }) {
  const data = points.map((p) => ({ ...p, reais: p.balance / 100 }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Saldo projetado no fim de cada mês">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
          <YAxis
            width={68}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            tickFormatter={(v: number) => formatBRLShort(v * 100)}
          />
          <ReferenceLine
            y={minCents / 100}
            stroke={AXIS}
            strokeDasharray="4 4"
            label={{ value: `mín. ${formatBRLShort(minCents)}`, position: "insideTopLeft", fill: AXIS, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13 }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            formatter={(v) => [formatBRL(Math.round(Number(v) * 100)), "Saldo no fim"]}
          />
          <Bar dataKey="reais" radius={[7, 7, 3, 3]} maxBarSize={44}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.balance < minCents ? CRITICAL : SERIES} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
