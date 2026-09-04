/* Divine Mercy PWA service worker.
 *
 * Two responsibilities:
 *   1. Push notifications for prayer alarms + meeting calls (unchanged).
 *   2. Offline app-shell caching so the parish app opens even when the
 *      phone is on a flaky connection.
 *
 * Bump CACHE_VERSION whenever the set of cached URLs changes to bust the
 * stale caches on existing installs.
 */
const CACHE_VERSION = "dm-shell-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Static assets that should always be available offline. Anything we ship
// from /public that the app references on first paint goes here. Keep this
// list tight — the broader cache strategy below (stale-while-revalidate)
// covers anything we miss.
const APP_SHELL = [
  "/",
  "/login",
  "/dashboard",
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/Images/SEETA PARISH DIVINE MERCY.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic — if any URL 404s the whole install fails. Pre-cache
      // one at a time so a missing future asset doesn't break the SW.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            /* skip missing optional assets */
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("dm-shell-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET. Don't intercept POSTs/PUTs (mutations) or anything with
  // a non-http scheme (chrome-extension://, data:, etc).
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth-sensitive traffic or live API calls — only static
  // navigation + asset requests. /api/notifications/subscribe and friends
  // have to hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Same-origin navigations: try the network, fall back to the cached
  // /offline page so the user sees something helpful instead of the browser's
  // offline dinosaur. /dashboard is auth-gated and would just redirect to
  // /login, so we don't try to serve it as a fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached =
            (await caches.match(req)) ||
            (await caches.match("/offline")) ||
            Response.error();
          return cached;
        }
      })()
    );
    return;
  }

  // Static assets (CSS/JS/images/fonts): stale-while-revalidate. The user
  // gets the cached copy instantly if we have it, and we refresh in the
  // background for next time.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })()
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Divine Mercy", body: "", url: "/dashboard" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  // Incoming call: if the app is open and visible, the in-app ringer handles
  // it — don't stack a second ringtone on top.
  const isCall = Boolean(payload.call);
  event.waitUntil(
    (async () => {
      if (isCall) {
        const clientList = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        if (clientList.some((c) => c.visibilityState === "visible")) return;
      }

      const tag = isCall ? `dm-call-${payload.url}` : "dm-alarm";
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/Images/SEETA PARISH DIVINE MERCY.png",
        badge: "/icon.png",
        tag,
        vibrate: isCall ? [500, 250, 500, 250, 500, 250, 800] : [200, 100, 200, 100, 400],
        requireInteraction: isCall || undefined,
        actions: isCall
          ? [
              { action: "join", title: "Join" },
              { action: "dismiss", title: "Dismiss" },
            ]
          : undefined,
        data: { url: payload.url },
      });

      // Stop ringing after ringMs so a missed call doesn't buzz forever. The
      // timeout must live inside waitUntil — service workers are killed when
      // idle, so a bare setTimeout wouldn't survive. Best-effort: some
      // browsers cap how long waitUntil keeps the worker alive; the in-app
      // missed-call banner stays authoritative either way.
      if (isCall) {
        const ringMs = typeof payload.ringMs === "number" ? payload.ringMs : 45000;
        await new Promise((resolve) => setTimeout(resolve, Math.min(ringMs, 60000)));
        const ns = await self.registration.getNotifications({ tag });
        for (const n of ns) n.close();
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(url).catch(() => {});
          }
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// A subscription expired or changed on the push service side — tell open
// tabs so the client can re-subscribe and sync the new endpoint.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
      }
    })
  );
});
