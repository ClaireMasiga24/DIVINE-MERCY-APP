/**
 * Client-side session wipe. Runs after the server-side logout has
 * cleared the cookies and revoked the Session row.
 *
 * Steps run in this ORDER. Order matters:
 *   1. Push unsubscribe + server cleanup — must finish before we kill
 *      the SW controller.
 *   2. localStorage clear.
 *   3. sessionStorage clear.
 *   4. IndexedDB delete (databases() with a fallback name list for iOS
 *      Safari ≤ 16.4 which returns []).
 *   5. SW wipe + unregister — LAST, so the SW controller is alive for
 *      the message-passing step before we kill it.
 *
 * Wrapped in a 1.5s timeout. Best-effort: if any step hangs, the
 * redirect still happens. The server-side cookie clear is the
 * authoritative part; this just makes the device leave no trace.
 */

const WIPE_TIMEOUT_MS = 1500;
// Kept in sync with CACHE_VERSION in public/sw.js.
const KNOWN_CACHE_DB_NAMES = ["dm-shell-v3-shell", "dm-shell-v3-runtime"];

async function tryUnsubscribePush(): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    // Best-effort server-side cleanup of the DeviceToken row. Swallow
    // any network error — the unsubscribe() below still kills the
    // browser-side subscription.
    try {
      await fetch("/api/notifications/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch {
      /* ignore */
    }
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* ignore */
  }
}

function clearLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Reverse-iterate to avoid index shifting as keys are removed.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k !== null) localStorage.removeItem(k);
    }
  } catch {
    /* storage blocked */
  }
}

function clearSessionStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

async function clearIndexedDB(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  // Feature-detect — iOS Safari ≤ 16.4 reports databases() but returns [].
  // On unsupported browsers, fall back to the known-name list.
  let names: string[] = [];
  try {
    const dbs = await (indexedDB as IDBFactory & {
      databases?: () => Promise<{ name?: string }[]>;
    }).databases?.();
    if (Array.isArray(dbs)) {
      names = dbs.map((d) => d.name).filter((n): n is string => typeof n === "string");
    }
  } catch {
    /* fall through to fallback names */
  }
  if (names.length === 0) names = KNOWN_CACHE_DB_NAMES.slice();
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        })
    )
  );
}

async function wipeServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) {
      reg.active.postMessage({ type: "WIPE_CACHES" });
    }
    await reg.unregister().catch(() => {});
  } catch {
    /* ignore */
  }
}

export async function wipeClientSession(): Promise<void> {
  const work = (async () => {
    await tryUnsubscribePush();
    clearLocalStorage();
    clearSessionStorage();
    await clearIndexedDB();
    await wipeServiceWorker();
  })();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => resolve(), WIPE_TIMEOUT_MS);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
