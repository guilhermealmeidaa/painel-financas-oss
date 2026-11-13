"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import { toast } from "sonner";
import { ALERT_KINDS } from "@/lib/alert-kinds";
import { cn } from "@/lib/utils";

type Support = "carregando" | "ok" | "instalar" | "sem-suporte";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const device = () => (/iphone/i.test(navigator.userAgent) ? "iPhone" : /ipad/i.test(navigator.userAgent) ? "iPad" : /android/i.test(navigator.userAgent) ? "Android" : "Computador");

/** Liga as notificações neste aparelho, envia um teste e escolhe quais avisos receber. */
export function NotificationsPanel({ prefs: initial, devices }: { prefs: Record<string, boolean>; devices: number }) {
  const [support, setSupport] = useState<Support>("carregando");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(initial);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setSupport(ios && !standalone ? "instalar" : "sem-suporte");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub) && Notification.permission === "granted");
      setSupport("ok");
    })().catch(() => setSupport("sem-suporte"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permissão negada. Libere em Ajustes → Notificações → Finanças.");
      const res = await fetch("/api/push/key");
      const { publicKey, error } = await res.json();
      if (!publicKey) throw new Error(error ?? "Servidor sem chave de notificação");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), device: device() }),
      });
      if (!save.ok) throw new Error("Não foi possível salvar este aparelho");
      setSubscribed(true);
      toast.success("Notificações ligadas neste aparelho");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notificações desligadas neste aparelho");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Enviada. Deve chegar em alguns segundos.");
    else toast.error(data.error ?? "Não foi possível enviar");
  }

  async function toggle(key: string, on: boolean) {
    setPrefs((p) => ({ ...p, [key]: on }));
    const res = await fetch("/api/settings/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, on }) });
    if (!res.ok) {
      setPrefs((p) => ({ ...p, [key]: !on }));
      toast.error("Não foi possível salvar");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
        {support === "carregando" && <p className="text-muted-foreground">Verificando o aparelho…</p>}
        {support === "instalar" && (
          <p>
            No iPhone, as notificações só funcionam com o painel <strong>instalado</strong>: no Safari, toque em <strong>Compartilhar</strong> →{" "}
            <strong>Adicionar à Tela de Início</strong>, abra pelo ícone e volte aqui.
          </p>
        )}
        {support === "sem-suporte" && <p className="text-muted-foreground">Este navegador não recebe notificações.</p>}
        {support === "ok" && (
          <>
            <p className="flex items-center gap-2">
              {subscribed ? <BellRing className="size-4 text-positive" /> : <BellOff className="size-4 text-muted-foreground" />}
              {subscribed ? "Ligadas neste aparelho." : "Desligadas neste aparelho."}
              <span className="text-xs text-muted-foreground">
                ({devices} {devices === 1 ? "aparelho cadastrado" : "aparelhos cadastrados"})
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {subscribed ? (
                <>
                  <button type="button" onClick={test} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground">
                    <Send className="size-4" /> Enviar teste
                  </button>
                  <button type="button" disabled={busy} onClick={disable} className="h-10 rounded-xl px-4 text-[13px] font-semibold ring-1 ring-border">
                    Desligar neste aparelho
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy} onClick={enable} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground">
                  <BellRing className="size-4" /> {busy ? "Ativando…" : "Ativar notificações"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <ul className="divide-y divide-border text-sm">
        {ALERT_KINDS.map((k) => {
          const on = prefs[k.key] !== false;
          return (
            <li key={k.key} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{k.label}</p>
                <p className="text-xs text-muted-foreground">{k.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={k.label}
                onClick={() => toggle(k.key, !on)}
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted ring-1 ring-border")}
              >
                <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Os avisos são verificados a cada atualização dos bancos (de 3 em 3 horas) e cada um chega uma vez só. Nada é alterado: eles só apontam.
      </p>
    </div>
  );
}
