/* Divine Mercy PWA service worker.
 *
 * Three responsibilities:
 *   1. Push notifications for prayer alarms + meeting calls.
 *   2. Offline app-shell caching so the parish app opens even when the
 *      phone is on a flaky connection.
 *   3. (Security) Auth-gated HTML (anything under /dashboard or
 *      /meeting-room) is NEVER cached and NEVER served from cache.
 *      The previous version pre-cached /dashboard, which let a stale
 *      snapshot of another member's dashboard surface on a fresh
 *      install or during a network blip. That whole leak path is now
 *      closed.
 *
 * Bump CACHE_VERSION whenever the set of cached URLs changes to bust
 * stale caches on existing installs.
 */
const CACHE_VERSION = "dm-shell-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Routes that render user-specific data. Caching their HTML responses
// — even briefly — is what produced the cross-device leakage. The SW
// bypasses the cache for all of these: navigations are network-only
// (with an inline "Connection lost" fallback when offline), asset
// requests for these paths are skipped entirely.
const AUTH_GATED_PREFIXES = ["/dashboard", "/meeting-room"];
const isAuthGated = (pathname) =>
  AUTH_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

// Static assets that should always be available offline. Note: /dashboard
// was here in v2 and is gone in v3 — it's the leak vector.
const APP_SHELL = [
  "/",
  "/login",
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

// Minimal HTML for when an auth-gated navigation can't reach the
// network. Deliberately does NOT auto-redirect anywhere — see
// app/offline/page.tsx for why the redirect loop is bad.
const OFFLINE_GATED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection lost</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:0;padding:24px;background:#F3EEE2;color:#3B2F1E;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}h1{font-size:1.25rem;margin:0 0 8px}p{font-size:.875rem;color:#6B5D4F;margin:0 0 20px}a{color:#3B2F1E;font-weight:600}</style></head><body><div><h1>Connection lost</h1><p>Sign in again once you're back online.</p><a href="/login">Sign in</a></div></body></html>`;

// 3xx responses pointing at /login are post-logout redirects. Caching
// them would let stale auth redirects linger in the runtime cache.
const isRedirectToLogin = (res) => {
  if (!res || res.status < 300 || res.status >= 400) return false;
  const loc = res.headers.get("Location") || "";
  return loc === "/login" || loc.endsWith("/login") || loc.includes("/login?");
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
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
      // Drop any caches from previous versions (incl. dm-shell-v2-shell
      // / dm-shell-v2-runtime, which were the leaky caches).
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // (1) Auth-gated navigation requests: network-only. Never cached,
  //     never served from cache. On network failure, return a tiny
  //     inline HTML so the user sees something without triggering the
  //     /offline redirect loop.
  if (isAuthGated(url.pathname) && req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store", credentials: "include" });
          // Intentionally NO cache.put here. If you ever add it, guard
          // it with isRedirectToLogin first to avoid caching stale
          // post-logout redirects.
          return fresh;
        } catch {
          return new Response(OFFLINE_GATED_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // (2) Other auth-gated asset requests: skip the cache entirely.
  if (isAuthGated(url.pathname)) return;

  // (3) Other navigations: try the network, fall back to the cached
  //     /offline page. Skip caching when the response is a 3xx to
  //     /login (post-logout) so it doesn't pollute the runtime cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok && !isRedirectToLogin(fresh)) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, fresh.clone()).catch(() => {});
          }
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

  // (4) Static assets (CSS/JS/images/fonts): stale-while-revalidate.
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

// Logout posts {type: "WIPE_CACHES"} to the SW. Drop our caches so a
// returning user (or a new one on the same device) starts clean.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WIPE_CACHES") {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith("dm-shell-")).map((k) => caches.delete(k))
        );
      })()
    );
  }
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

  // Incoming call: if the app is open and visible, the in-app ringer
  // handles it — don't stack a second ringtone on top.
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
        badge: "/icon-192.png",
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

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
      }
    })
  );
});
