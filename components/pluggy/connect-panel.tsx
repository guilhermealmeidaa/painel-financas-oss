"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// O widget usa window/iframe: só no cliente.
/** Conector MeuPluggy (uso pessoal). Conectar o banco direto exige acesso de produção na Pluggy. */
const MEU_PLUGGY_CONNECTOR_ID = 200;

const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((m) => m.PluggyConnect), { ssr: false });

interface SyncItem {
  connector: string | null;
  inserted: number;
  updated: number;
  linkedManual: number;
  bills: number;
  error?: string;
}

async function postJSON(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erro");
  return data;
}

export function ConnectPanel({ hasItems }: { hasItems: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState<{ value: string; updateItem?: string } | null>(null);
  const [busy, setBusy] = useState<"token" | "save" | "sync" | null>(null);
  const [manualId, setManualId] = useState("");

  async function openWidget(updateItem?: string) {
    setBusy("token");
    try {
      const { accessToken } = await postJSON("/api/pluggy/token", updateItem ? { itemId: updateItem } : undefined);
      setToken({ value: accessToken, updateItem });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveItem(itemId: string) {
    setBusy("save");
    try {
      const r = await postJSON("/api/pluggy/items", { itemId });
      toast.success(`Conectado: ${r.connector ?? "item"}. Sincronizando…`);
      setManualId("");
      await sync();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      const { items } = (await postJSON("/api/pluggy/sync")) as { items: SyncItem[] };
      const failed = items.filter((i) => i.error);
      const ins = items.reduce((s, i) => s + i.inserted, 0);
      const linked = items.reduce((s, i) => s + i.linkedManual, 0);
      if (failed.length) toast.error(`${failed.length} conexão(ões) com erro: ${failed[0].error}`);
      toast.success(`Sync ok: ${ins} transações novas${linked ? `, ${linked} casadas com lançamentos manuais` : ""}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openWidget()} disabled={busy !== null} className="h-11">
          <Link2 className="size-4" /> {busy === "token" ? "Abrindo…" : "Conectar com Meu Pluggy"}
        </Button>
        {hasItems && (
          <Button variant="outline" onClick={sync} disabled={busy !== null} className="h-11">
            <RefreshCw className={busy === "sync" ? "size-4 animate-spin" : "size-4"} /> {busy === "sync" ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        )}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (manualId.trim()) saveItem(manualId.trim());
        }}
      >
        <Input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="ou cole um itemId do Dashboard da Pluggy"
          className="h-11 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" disabled={busy !== null || !manualId.trim()} className="h-11">
          Adicionar item
        </Button>
      </form>

      {token && (
        <PluggyConnect
          connectToken={token.value}
          updateItem={token.updateItem}
          includeSandbox={false}
          connectorIds={[MEU_PLUGGY_CONNECTOR_ID]}
          selectedConnectorId={token.updateItem ? undefined : MEU_PLUGGY_CONNECTOR_ID}
          onSuccess={({ item }) => {
            setToken(null);
            saveItem(item.id);
          }}
          onError={(err) => {
            toast.error(err.message ?? "Erro na conexão");
          }}
          onClose={() => setToken(null)}
        />
      )}
    </div>
  );
}

/** Botão "Reautorizar" de um item (consentimento expirado ou erro de login). */
export function ReauthButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={async () => {
          try {
            const { accessToken } = await postJSON("/api/pluggy/token", { itemId });
            setToken(accessToken);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Reautorizar
      </button>
      {token && (
        <PluggyConnect
          connectToken={token}
          updateItem={itemId}
          onSuccess={() => {
            setToken(null);
            toast.success("Reautorizado");
            router.refresh();
          }}
          onClose={() => setToken(null)}
        />
      )}
    </>
  );
}

export function RemoveItemButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <button
      type="button"
      className="text-xs text-destructive hover:underline"
      onClick={async () => {
        const res = await fetch(`/api/pluggy/items/${id}`, { method: "DELETE" });
        if (!res.ok) toast.error("Não foi possível remover");
        router.refresh();
      }}
    >
      Confirmar remoção
    </button>
  ) : (
    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setConfirm(true)}>
      Remover
    </button>
  );
}
