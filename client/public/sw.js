// Sealr service worker: keeps the app shell available offline and shows push notifications.
// Pushes carry no message content: the relay cannot read messages, so it can only say that one arrived and from which address.
const SHELL = "sealr-shell-v2";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(["/", "/app", "/manifest.webmanifest", "/icon-192.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// The page and built assets: network first, cache as a fallback. The API and chain calls are never cached.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/")) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
});

self.addEventListener("push", e => {
  let data = {};
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    if (wins.some(w => w.visibilityState === "visible")) return; // the open app shows it already
    return self.registration.showNotification(data.title || "Sealr", {
      body: data.body || "New sealed message",
      icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag || "sealr", renotify: true,
      data: { url: data.url || "/app" },
    });
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    const w = wins[0];
    return w ? w.focus() : self.clients.openWindow(e.notification.data?.url || "/app");
  }));
});
