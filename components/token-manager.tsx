"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  scopes: string[];
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
  } catch {
    toast.error("Não deu pra copiar; selecione e copie à mão");
  }
}

function TokenItem({ t, onRevoke }: { t: TokenRow; onRevoke?: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className={t.revoked_at ? "text-muted-foreground line-through" : "font-medium"}>
          {t.name}{" "}
          <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${t.scopes.includes("write") ? "bg-warning/20" : "bg-muted text-muted-foreground"}`}>
            {t.scopes.includes("write") ? "leitura + lançar gastos" : "só leitura"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{t.prefix}…</span> · criado {dt.format(new Date(t.created_at))} · último uso{" "}
          {t.last_used_at ? dt.format(new Date(t.last_used_at)) : "nunca"}
        </p>
      </div>
      {onRevoke ? (
        <button type="button" onClick={onRevoke} className="shrink-0 text-xs text-destructive hover:underline">
          Revogar
        </button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">revogado</span>
      )}
    </li>
  );
}

export function TokenManager({ tokens, mcpUrl }: { tokens: TokenRow[]; mcpUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("Claude Code");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [write, setWrite] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, write }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(data.error ?? "Erro");
    setCreated(data.token);
    setWrite(false);
    router.refresh();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Não foi possível revogar");
    else toast.success("Token revogado");
    router.refresh();
  }

  const active = tokens.filter((t) => !t.revoked_at);
  const revoked = tokens.filter((t) => t.revoked_at);

  const command = created
    ? `claude mcp add --scope user --transport http financas ${mcpUrl} --header "Authorization: Bearer ${created}"`
    : "";

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Claude Code)" className="h-11" maxLength={60} />
        <Button type="submit" disabled={busy || !name.trim()} className="h-11">
          <KeyRound className="size-4" /> Gerar token
        </Button>
      </form>
      <label className="-mt-2 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          Permitir lançar gastos
          <span className="block text-xs text-muted-foreground">
            Libera só a ferramenta lancar_gasto, que cria um lançamento manual. Nada é editado nem apagado.
          </span>
        </span>
      </label>

      {created && (
        <div className="flex flex-col gap-3 rounded-2xl bg-warning/15 p-4 text-sm">
          <p className="font-medium">Copie agora: este token não aparece de novo.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2 font-mono text-xs">{created}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(created)}>
              <Copy className="size-3.5" /> Token
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Para o Claude Code, rode no terminal:</p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2 font-mono text-[11px] break-all">{command}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(command)}>
              <Copy className="size-3.5" /> Comando
            </Button>
          </div>
          <button type="button" onClick={() => setCreated(null)} className="self-start text-xs text-muted-foreground hover:text-foreground">
            Já copiei, esconder
          </button>
        </div>
      )}

      <ul className="divide-y divide-border text-sm">
        {active.length === 0 && <li className="py-2 text-muted-foreground">Nenhum token ativo.</li>}
        {active.map((t) => (
          <TokenItem key={t.id} t={t} onRevoke={() => revoke(t.id)} />
        ))}
      </ul>
      {revoked.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Revogados ({revoked.length})</summary>
          <ul className="mt-1 divide-y divide-border">
            {revoked.map((t) => (
              <TokenItem key={t.id} t={t} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
