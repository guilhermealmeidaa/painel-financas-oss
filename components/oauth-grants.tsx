"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export interface GrantRow {
  id: string;
  client_name: string;
  redirect_host: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Conexões OAuth (conector do claude.ai, Claude Code…): escopo, último uso e revogar. */
export function OAuthGrants({ grants }: { grants: GrantRow[] }) {
  const router = useRouter();

  async function revoke(id: string) {
    const res = await fetch(`/api/oauth-grants/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Não foi possível revogar");
    else toast.success("Conexão revogada");
    router.refresh();
  }

  if (!grants.length) return <p className="text-sm text-muted-foreground">Nenhuma conexão ainda.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {grants.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className={g.revoked_at ? "text-muted-foreground line-through" : "font-medium"}>
              {g.client_name}{" "}
              <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${g.scopes.includes("write") ? "bg-warning/20" : "bg-muted text-muted-foreground"}`}>
                {g.scopes.includes("write") ? "leitura + lançar gastos" : "só leitura"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {g.redirect_host} · conectado {dt.format(new Date(g.created_at))} · último uso {g.last_used_at ? dt.format(new Date(g.last_used_at)) : "nunca"}
            </p>
          </div>
          {g.revoked_at ? (
            <span className="text-xs text-muted-foreground">revogada</span>
          ) : (
            <button type="button" onClick={() => revoke(g.id)} className="text-xs text-destructive hover:underline">
              Revogar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
