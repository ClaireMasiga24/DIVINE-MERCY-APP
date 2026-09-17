/**
 * Service-worker registration helper. Single source of truth for the SW
 * script URL.
 *
 * The `?v=<build id>` query (see next.config.ts) matters for two reasons:
 *   1. It makes the script URL change on every deploy, so the browser
 *      re-fetches and re-installs the worker instead of keeping the old one.
 *   2. public/sw.js reads it back off `self.location` and names its caches
 *      with it, so a new deploy can never inherit the previous deploy's
 *      cached HTML / chunk references.
 *
 * IMPORTANT: every registration site must go through `registerServiceWorker`.
 * If one place registers "/sw.js" and another "/sw.js?v=…", the browser
 * treats them as two different script URLs and flips the registration back
 * and forth, re-installing the worker on every page load.
 */

/** The deploy id, inlined at build time. "v0" only if the build somehow lost it. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "v0";

/** The versioned SW script URL. */
export const SW_SCRIPT_URL = `/sw.js?v=${encodeURIComponent(BUILD_ID)}`;

/**
 * Registers the service worker at the versioned URL.
 * Never throws — a failed registration must not break the page.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_SCRIPT_URL, { scope: "/" });
  } catch {
    return null;
  }
}
