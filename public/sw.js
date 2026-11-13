// Service worker do painel instalado (PWA).
// - Visão geral ("/"): rede primeiro; sem internet, mostra a última versão vista (com o horário dela).
// - Arquivos do Next (/_next/static): cache primeiro (são imutáveis), para a página offline ter estilo.
// - Nada de /api no cache. Ao sair da conta, apaga tudo o que foi guardado.
const HOME = "pf-home-v1";
const STATIC = "pf-static-v1";
const KEEP = [HOME, STATIC];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem internet</title><body style="font-family:system-ui;background:#16171c;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
<div><p style="font-size:18px;font-weight:600">Sem internet</p><p style="opacity:.7">Abra a Visão geral para ver os últimos números salvos.</p><p><a href="/" style="color:#8aa8ff">Visão geral</a></p></div></body></html>`;

// notificações (Web Push): o servidor manda { title, body, url, tag }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Painel de finanças", {
      body: data.body || "",
      tag: data.tag,
      icon: "/pwa/icon/192",
      badge: "/pwa/icon/192",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // sair da conta: apaga os números guardados antes de seguir
  if (req.method === "POST" && url.pathname === "/api/auth/signout") {
    event.respondWith(
      (async () => {
        await Promise.all(KEEP.map((k) => caches.delete(k)));
        return fetch(req);
      })(),
    );
    return;
  }
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // só guarda a Visão geral do mês atual, e só se não caiu no login
          if (url.pathname === "/" && !url.search && res.ok && !res.redirected) {
            const cache = await caches.open(HOME);
            await cache.put("/", res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match("/", { cacheName: HOME });
          if (cached && url.pathname === "/") return cached;
          return new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
      })(),
    );
  }
});
