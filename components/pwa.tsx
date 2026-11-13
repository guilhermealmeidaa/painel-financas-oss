"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Share, WifiOff, X } from "lucide-react";

/** Registra o service worker (só em produção). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

const hm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Sem internet: avisa que os números são os da última vez que a página carregou. */
export function OfflineBanner({ renderedAt }: { renderedAt: string }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p className="surface flex items-center gap-3 px-5 py-3 text-[13px]">
      <WifiOff className="size-4 shrink-0 text-warning" />
      <span>
        Sem internet: estes são os números de <strong className="tabular-nums">{hm.format(new Date(renderedAt))}</strong>.
      </span>
    </p>
  );
}

const DISMISS_KEY = "pf-install-tip-dismissed";

/** No iPhone, pelo Safari e ainda não instalado: ensina a adicionar à tela de início. */
export function InstallTip() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende do navegador, só existe no cliente
    if (ios && !standalone && !dismissed) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div className="surface flex items-start gap-3 px-5 py-3 text-[13px] lg:hidden">
      <Share className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="flex-1">
        Instale o painel: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Ele abre em tela cheia, como um app.
      </p>
      <button
        type="button"
        aria-label="Fechar dica"
        className="text-muted-foreground"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {}
          setShow(false);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
