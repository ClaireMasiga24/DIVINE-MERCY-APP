/* Divine Mercy PWA service worker.
 *
 * Responsibilities:
 *   1. Push notifications for prayer alarms + meeting calls.
 *   2. Offline fallback so a phone with no connection sees a real page
 *      instead of the browser's raw error screen.
 *   3. Caching for immutable build assets, scoped to the current deploy.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CACHES ARE KEYED TO THE BUILD ID
 * ---------------------------------------------------------------------------
 * This worker used to key its caches on a hand-maintained constant
 * ("dm-shell-v4"). Nothing invalidated those caches on a new deployment, so
 * after a redeploy an installed phone kept being served:
 *   - HTML documents from the old build (cached on every successful
 *     navigation), and
 *   - App Router navigation payloads from the old build,
 * both of which name the build's JS chunks by content hash. The new deploy
 * does not serve the old hashes, so the client's dynamic import rejected
 * with ChunkLoadError, the app never booted, and Reload replayed the same
 * cache — permanently, until the user cleared site data. Fresh (uncontrolled)
 * visitors were unaffected, because no worker sat between them and the
 * network. That asymmetry is exactly the reported symptom.
 *
 * Two rules now prevent it:
 *   - The cache names carry the build id, which the page passes in the SW
 *     script URL (/sw.js?v=<build id>, see lib/sw-version.ts). A new deploy
 *     therefore names new caches, and `activate` deletes every cache that
 *     isn't one of the current two.
 *   - No document and no navigation payload is ever replayed from cache.
 *     Documents go network-first; `?_rsc=` / RSC requests skip the worker
 *     entirely. A network failure gets the offline page.
 *
 * The page also posts its build id to the worker on every load
 * ("SET_BUILD_ID"). If it differs from this worker's, the worker drops all
 * its caches and re-seeds. That covers the case where the worker was not
 * re-installed (its script bytes unchanged) but the app was rebuilt.
 *
 * A malformed/absent `?v=` degrades to "v0" rather than breaking anything —
 * the page's build-id message corrects it on the next load.
 */

const DEFAULT_BUILD_ID = "v0";
// Every cache this worker owns starts with this, so older names (e.g.
// "dm-shell-v4-runtime" from before build-keyed caches) are cleaned up too.
const CACHE_NAMESPACE = "dm";

function shellCacheName(buildId) {
  return `${CACHE_NAMESPACE}-${buildId}-shell`;
}
function runtimeCacheName(buildId) {
  return `${CACHE_NAMESPACE}-${buildId}-runtime`;
}
function isOurCache(key) {
  return key === CACHE_NAMESPACE || key.startsWith(`${CACHE_NAMESPACE}-`);
}

function readBuildIdFromScriptUrl() {
  try {
    return new URL(self.location.href).searchParams.get("v") || DEFAULT_BUILD_ID;
  } catch {
    return DEFAULT_BUILD_ID;
  }
}

let buildId = readBuildIdFromScriptUrl();
let SHELL_CACHE = shellCacheName(buildId);
let RUNTIME_CACHE = runtimeCacheName(buildId);

/**
 * Small, cacheable files that make the offline experience work. Only
 * static, non-user-specific URLs belong here.
 *
 * "/offline" is the genuine network-loss page. "/" and "/login" used to be
 * here as well; they were the stale-document vector (see the header note) and
 * documents are now network-first, so pre-caching them bought nothing.
 */
const APP_SHELL = [
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

/**
 * Self-contained offline page. Served when a navigation can't reach the
 * network and the real "/offline" page isn't cached. No script tags and no
 * chunk references, so it renders even with an empty cache. Never hand a
 * navigation back as Response.error() — that is what Chrome paints as its
 * "This page couldn't load / A server error occurred" screen, and it offers
 * the user nothing to act on.
 */
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You're offline</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px;background:#F3EEE2;color:#3B2F1E;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}h1{font-size:1.25rem;margin:0 0 8px}p{font-size:.875rem;color:#6B5D4F;margin:0 0 18px;max-width:28rem}a.primary{display:inline-block;background:#C9A24E;color:#3B2F1E;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:999px}</style></head><body><div><h1>You're offline</h1><p>Divine Mercy Seeta can't reach the internet right now. Alarms you enabled still ring, even while the app is closed.</p><a class="primary" href="/">Try again</a></div></body></html>`;

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    APP_SHELL.map((url) =>
      cache.add(url).catch(() => {
        /* skip missing optional assets */
      })
    )
  );
}

/** Deletes every cache this worker owns. */
async function purgeAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(isOurCache).map((k) => caches.delete(k)));
}

/**
 * Applies a build id reported by the page. When it differs from ours we are
 * looking at a stale install: drop everything and re-seed for the new build.
 * Caches are deliberately emptied rather than migrated — the whole point is
 * that nothing from the previous build may be reused.
 */
async function applyBuildId(nextId) {
  if (!nextId || typeof nextId !== "string" || nextId === buildId) return;
  await purgeAllCaches();
  buildId = nextId;
  SHELL_CACHE = shellCacheName(buildId);
  RUNTIME_CACHE = runtimeCacheName(buildId);
  await precacheShell();
}

/**
 * True for Next.js App Router client-navigation payloads. These carry the
 * build's chunk manifest, so replaying one across a deploy is the primary
 * cause of ChunkLoadError. They are never cached or served by this worker —
 * returning without respondWith lets the browser handle them normally.
 */
function isNavigationPayload(req, url) {
  if (url.searchParams.has("_rsc")) return true;
  if (req.headers.get("RSC") === "1") return true;
  if (req.headers.get("Next-Router-Prefetch") === "1") return true;
  if (req.headers.get("Next-Router-State-Tree") !== null) return true;
  return false;
}

/** Offline fallback for a navigation: the real page if cached, else inline HTML. */
async function offlineNavigationResponse() {
  try {
    const cached = await caches.match("/offline", { cacheName: SHELL_CACHE });
    if (cached) return cached;
  } catch {
    /* fall through */
  }
  try {
    const anyCache = await caches.match("/offline");
    if (anyCache) return anyCache;
  } catch {
    /* fall through */
  }
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Documents are network-first and never persisted. A cached document is
 * only ever correct for the build that produced it, and a document from the
 * wrong build is a dead app.
 */
async function handleNavigation(req) {
  try {
    return await fetch(req);
  } catch {
    return offlineNavigationResponse();
  }
}

/**
 * Everything else same-origin that isn't an API call and isn't a navigation
 * payload: build assets (content-hashed and therefore immutable), images,
 * fonts, the manifest. Stale-while-revalidate, against a cache that only
 * ever holds assets for the current build.
 */
async function handleAsset(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);

  const networkFetch = fetch(req)
    .then((res) => {
      // Persist only real, complete, same-origin 200s. A 404/500 chunk stays
      // out of the cache so the next load retries the network rather than
      // pinning a dead response forever.
      if (res && res.ok && res.status === 200 && res.type !== "opaque") {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => cached);

  return cached || networkFetch;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheShell();
      // Take over as soon as possible: a worker parked in "waiting" is a
      // device that keeps running the previous build's cache logic.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache that isn't one of the two keyed to this build —
      // including the pre-build-id names ("dm-shell-v4-*"), which is what
      // lets an already-installed, currently-broken phone heal itself on its
      // next load with no uninstall or cache clearing.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => isOurCache(k) && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
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

  // RSC/navigation payloads: straight to the network, worker not involved.
  if (isNavigationPayload(req, url)) return;

  // Full document loads.
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  // Everything else: content-hashed assets and other static files.
  event.respondWith(handleAsset(req));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // The page reports which build it came from on every load.
  if (data.type === "SET_BUILD_ID") {
    event.waitUntil(applyBuildId(data.buildId));
    return;
  }

  // Logout: leave no cached app content behind.
  if (data.type === "WIPE_CACHES") {
    event.waitUntil(purgeAllCaches());
    return;
  }

  // Re-create the pre-cached shell (used after a purge or a wipe).
  if (data.type === "RESEED_SHELL") {
    event.waitUntil(precacheShell());
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
