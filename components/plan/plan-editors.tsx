"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBucketLabels } from "@/components/labels-provider";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Erro");
  }
}

const inputCls = "h-10 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

// ---------- linha editável (valor + apagar) ----------

function Row({
  label,
  sub,
  amount,
  onSave,
  onDelete,
}: {
  label: string;
  sub?: string;
  amount: number;
  onSave: (cents: number, forward: boolean) => Promise<void>;
  onDelete: (forward: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState((amount / 100).toFixed(2).replace(".", ","));
  const [asking, setAsking] = useState<"save" | "delete" | null>(null);
  const parsed = parseBRLToCents(value);
  const dirty = parsed != null && parsed !== amount;

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(null);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{label}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className={cn(inputCls, "w-28 text-right tabular-nums")}
          aria-label={`Valor de ${label}`}
        />
        {dirty ? (
          <Button size="sm" onClick={() => setAsking("save")}>
            Salvar
          </Button>
        ) : (
          <button type="button" onClick={() => setAsking("delete")} className="p-2 text-muted-foreground hover:text-destructive" aria-label={`Apagar ${label}`}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {asking && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="text-muted-foreground">{asking === "save" ? "Mudar o valor em:" : "Apagar:"}</span>
          <button
            type="button"
            className="rounded-lg bg-muted px-2.5 py-1.5"
            onClick={() =>
              run(asking === "save" ? () => onSave(parsed!, false) : () => onDelete(false), asking === "save" ? "Salvo" : "Apagado")
            }
          >
            só neste mês
          </button>
          <button
            type="button"
            className={cn("rounded-lg px-2.5 py-1.5", asking === "delete" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary")}
            onClick={() =>
              run(asking === "save" ? () => onSave(parsed!, true) : () => onDelete(true), asking === "save" ? "Salvo" : "Apagado")
            }
          >
            neste e nos próximos
          </button>
          <button type="button" className="px-2 py-1.5 text-muted-foreground" onClick={() => setAsking(null)}>
            cancelar
          </button>
        </div>
      )}
    </li>
  );
}

function RepeatSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} aria-label="Repetir">
      {[1, 2, 3, 4, 6, 12, 24].map((n) => (
        <option key={n} value={n}>
          {n === 1 ? "só este mês" : `por ${n} meses`}
        </option>
      ))}
    </select>
  );
}

// ---------- Entradas ----------

export interface IncomeRow {
  id: string;
  description: string;
  kind: "salario" | "13o" | "freela" | "outro";
  amount_cents: number;
}
const KIND_LABEL = { salario: "Salário", "13o": "13º", freela: "Freela", outro: "Outro" } as const;

export function IncomesEditor({ month, rows }: { month: string; rows: IncomeRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ description: "Salário líquido", kind: "salario" as IncomeRow["kind"], amount: "", repeat: 1 });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseBRLToCents(form.amount);
    if (!amount) return toast.error("Valor inválido");
    try {
      await send("/api/incomes", "POST", { month, description: form.description, kind: form.kind, amount_cents: amount, repeat: form.repeat });
      toast.success(form.repeat > 1 ? `Entrada criada em ${form.repeat} meses` : "Entrada criada");
      setForm({ ...form, amount: "" });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border">
        {rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nenhuma entrada neste mês.</li>}
        {rows.map((r) => (
          <Row
            key={r.id}
            label={r.description}
            sub={KIND_LABEL[r.kind]}
            amount={r.amount_cents}
            onSave={async (c, forward) => {
              await send(`/api/incomes/${r.id}`, "PATCH", { amount_cents: c, scope: forward ? "forward" : undefined });
              router.refresh();
            }}
            onDelete={async (forward) => {
              await send(`/api/incomes/${r.id}${forward ? "?scope=forward" : ""}`, "DELETE");
              router.refresh();
            }}
          />
        ))}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-3">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Descrição"
          className="col-span-2 h-10"
          maxLength={60}
        />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as IncomeRow["kind"] })} className={inputCls} aria-label="Tipo">
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" inputMode="decimal" className="h-10" />
        <RepeatSelect value={form.repeat} onChange={(repeat) => setForm({ ...form, repeat })} />
        <Button type="submit" className="col-span-2 h-10">
          <Plus className="size-4" /> Adicionar entrada
        </Button>
      </form>
    </div>
  );
}

// ---------- Fixos ----------

export interface FixedRow {
  id: string;
  name: string;
  category: "cartao" | "emprestimo" | "veiculo" | "conta";
  account_id: string | null;
  amount_cents: number;
}
const CAT_LABEL = { conta: "Conta (luz, internet, celular…)", emprestimo: "Empréstimo", veiculo: "Veículo / financiamento", cartao: "Cartão (parcelas antigas)" } as const;
const CAT_SHORT = { conta: "Conta", emprestimo: "Empréstimo", veiculo: "Veículo", cartao: "Cartão" } as const;

export function FixedEditor({ month, rows, cards }: { month: string; rows: FixedRow[]; cards: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", category: "conta" as FixedRow["category"], account_id: "", amount: "", repeat: 12 });
  const names = new Map(cards.map((c) => [c.id, c.name]));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseBRLToCents(form.amount);
    if (amount == null || !form.name.trim()) return toast.error("Preencha nome e valor");
    try {
      await send("/api/fixed", "POST", {
        month,
        name: form.name,
        category: form.category,
        account_id: form.account_id || null,
        amount_cents: amount,
        repeat: form.repeat,
      });
      toast.success(form.repeat > 1 ? `Fixo salvo em ${form.repeat} meses` : "Fixo salvo");
      setForm({ ...form, name: "", amount: "" });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const order = ["cartao", "emprestimo", "veiculo", "conta"] as const;
  const sorted = [...rows].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.amount_cents - a.amount_cents);

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border">
        {rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nenhum fixo neste mês.</li>}
        {sorted.map((r) => (
          <Row
            key={r.id}
            label={r.name}
            sub={`${CAT_SHORT[r.category]}${r.account_id && names.get(r.account_id) ? ` · ${names.get(r.account_id)}` : ""}`}
            amount={r.amount_cents}
            onSave={async (c, forward) => {
              await send(`/api/fixed/${r.id}`, "PATCH", { amount_cents: c, scope: forward ? "forward" : undefined });
              router.refresh();
            }}
            onDelete={async (forward) => {
              await send(`/api/fixed/${r.id}${forward ? "?scope=forward" : ""}`, "DELETE");
              router.refresh();
            }}
          />
        ))}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-3">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nome (ex.: Celular Claro)"
          className="col-span-2 h-10"
          maxLength={60}
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as FixedRow["category"] })}
          className={cn(inputCls, "col-span-2 sm:col-span-1")}
          aria-label="Categoria"
        >
          {Object.entries(CAT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" inputMode="decimal" className="h-10" />
        <RepeatSelect value={form.repeat} onChange={(repeat) => setForm({ ...form, repeat })} />
        <Button type="submit" className="col-span-2 h-10">
          <Plus className="size-4" /> Adicionar fixo
        </Button>
        {form.category === "cartao" && (
          <select
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
            className={cn(inputCls, "col-span-2")}
            aria-label="Cartão"
          >
            <option value="">Cartão não informado</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </form>
    </div>
  );
}

// ---------- Teto do dia a dia ----------

export function BudgetEditor({
  month,
  budget,
}: {
  month: string;
  budget: { cap_cents: number; method: "credito" | "debito_pix"; lazer: number; mercado: number; control_start?: string | null } | null;
}) {
  const router = useRouter();
  const labels = useBucketLabels();
  const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const [cap, setCap] = useState(budget ? fmt(budget.cap_cents) : "1500,00");
  const [lazer, setLazer] = useState(budget ? fmt(budget.lazer) : "1000,00");
  const [mercado, setMercado] = useState(budget ? fmt(budget.mercado) : "500,00");
  const [method, setMethod] = useState<"credito" | "debito_pix">(budget?.method ?? "debito_pix");
  const [repeat, setRepeat] = useState(1);
  const [start, setStart] = useState(budget?.control_start ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const c = parseBRLToCents(cap);
    const r = parseBRLToCents(lazer) ?? 0;
    const n = parseBRLToCents(mercado) ?? 0;
    if (c == null) return toast.error("Teto inválido");
    try {
      await send("/api/budgets", "PUT", { month, cap_cents: c, lazer_cents: r, mercado_cents: n, method, repeat, control_start: start || null });
      toast.success(repeat > 1 ? `Teto salvo em ${repeat} meses` : "Teto salvo");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const c = parseBRLToCents(cap) ?? 0;
  const rest = c - (parseBRLToCents(lazer) ?? 0) - (parseBRLToCents(mercado) ?? 0);

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {!budget && <p className="text-sm text-warning">Sem teto neste mês: a projeção considera R$ 0 de dia a dia.</p>}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Teto
          <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="h-10 text-right tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.lazer}
          <Input value={lazer} onChange={(e) => setLazer(e.target.value)} inputMode="decimal" className="h-10 text-right tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.mercado}
          <Input value={mercado} onChange={(e) => setMercado(e.target.value)} inputMode="decimal" className="h-10 text-right tabular-nums" />
        </label>
      </div>
      {rest !== 0 && (
        <p className={cn("text-xs", rest < 0 ? "text-destructive" : "text-muted-foreground")}>
          {rest < 0 ? `${labels.lazer} + ${labels.mercado.toLowerCase()} passam do teto em ${formatBRL(-rest)}` : `${formatBRL(rest)} do teto sem divisão`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(["debito_pix", "credito"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            aria-pressed={method === m}
            className={cn(
              "h-10 flex-1 rounded-xl border text-sm",
              method === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground",
            )}
          >
            {m === "credito" ? "Crédito (na fatura)" : "Débito/Pix"}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        Contar o dia a dia a partir de
        <Input
          type="date"
          value={start}
          min={month}
          onChange={(e) => setStart(e.target.value)}
          className="h-9 w-40"
          aria-label="Início do controle"
        />
      </label>
      <div className="flex gap-2">
        <RepeatSelect value={repeat} onChange={setRepeat} />
        <Button type="submit" className="h-10 flex-1">
          Salvar teto
        </Button>
      </div>
    </form>
  );
}

export function CopyPrevButton({ month }: { month: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      className="h-10"
      onClick={async () => {
        setBusy(true);
        try {
          await send("/api/plan/copy", "POST", { month });
          toast.success("Copiado do mês anterior (sem 13º e sem parcelas antigas de cartão)");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Copiar do mês anterior
    </Button>
  );
}

// ---------- Preferências ----------

/**
 * Nomes das duas categorias do dia a dia e quem é você nos extratos
 * (nome e CPF/CNPJ: transferências para você mesmo não contam como gasto).
 */
export function PreferencesEditor({
  initial,
  onSaved,
}: {
  initial: { label_lazer: string; label_mercado: string; self_names: string[]; self_tax_ids: string[] };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [lazer, setLazer] = useState(initial.label_lazer);
  const [mercado, setMercado] = useState(initial.label_mercado);
  const [names, setNames] = useState(initial.self_names.join("\n"));
  const [ids, setIds] = useState(initial.self_tax_ids.join("\n"));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await send("/api/settings", "PATCH", { label_lazer: lazer, label_mercado: mercado, self_names: names, self_tax_ids: ids });
      toast.success("Preferências salvas");
      router.refresh();
      onSaved?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Os dois tipos de gasto que contam no dia a dia. Dê o nome que fizer sentido pra você.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Categoria 1
          <Input value={lazer} onChange={(e) => setLazer(e.target.value)} maxLength={40} placeholder="Lazer" className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Categoria 2
          <Input value={mercado} onChange={(e) => setMercado(e.target.value)} maxLength={40} placeholder="Mercado" className="h-10" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Seus nomes como aparecem no extrato (um por linha)
        <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={2} placeholder="Maria da Silva" className={cn(inputCls, "h-auto py-2")} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Seu CPF e o CNPJ da sua empresa, se tiver (um por linha)
        <textarea value={ids} onChange={(e) => setIds(e.target.value)} rows={2} placeholder="000.000.000-00" className={cn(inputCls, "h-auto py-2")} />
      </label>
      <p className="text-xs text-muted-foreground">
        Com isso, um Pix ou transferência entre as suas contas é reconhecido e não entra como gasto. Fica só no seu banco de dados.
      </p>
      <Button type="submit" disabled={saving} className="h-10">
        {saving ? "Salvando…" : "Salvar preferências"}
      </Button>
    </form>
  );
}

// ---------- Períodos especiais ----------

export interface PeriodRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  cap_cents: number;
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function PeriodsEditor({ month, rows, capCents }: { month: string; rows: PeriodRow[]; capCents: number | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "Viagem", start: "", end: "", cap: "" });
  const reserved = rows.reduce((s, r) => s + r.cap_cents, 0);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const cap = parseBRLToCents(form.cap);
    if (cap == null) return toast.error("Teto inválido");
    try {
      await send("/api/budget-periods", "POST", { name: form.name, start_date: form.start, end_date: form.end || form.start, cap_cents: cap });
      toast.success("Período criado");
      setForm({ name: "Viagem", start: "", end: "", cap: "" });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await send(`/api/budget-periods/${id}`, "DELETE");
      toast.success("Período removido");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (capCents == null) return <p className="text-sm text-muted-foreground">Cadastre o teto do dia a dia do mês primeiro.</p>;

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border">
        {rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nenhum período neste mês.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-medium">{r.name}</span>{" "}
              <span className="text-muted-foreground">
                {br(r.start_date)}–{br(r.end_date)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">{formatBRL(r.cap_cents)}</span>
              <button type="button" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remover ${r.name}`}>
                <Trash2 className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Reservado: {formatBRL(reserved)} de {formatBRL(capCents)}. Sobra {formatBRL(capCents - reserved)} para os fins de semana normais.
        </p>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-3">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome (ex.: Viagem)" className="col-span-2 h-10" maxLength={60} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <input type="date" required min={month} max={last} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input type="date" min={form.start || month} max={last} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inputCls} />
        </label>
        <Input value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} placeholder="Teto do período (0,00)" inputMode="decimal" className="col-span-2 h-10" />
        <Button type="submit" className="col-span-2 h-10" disabled={!form.start || !form.name.trim()}>
          <Plus className="size-4" /> Adicionar período
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        O teto do período sai de dentro do teto do mês (a projeção não muda). Gastos do dia a dia com data no período contam nele, e os fins de
        semana do período saem do ritmo.
      </p>
    </div>
  );
}
