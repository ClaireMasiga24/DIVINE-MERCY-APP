/**
 * Source for a tiny blocking script that catches a failed JS-chunk load and
 * recovers from it, instead of leaving the user on a dead page.
 *
 * Why this is injected as an inline script in the root layout's <head>
 * rather than living in a React component: the code that *handles* a chunk
 * failure cannot itself live in a chunk — if the chunk that fails is the one
 * that would have installed the handler, nothing ever runs. An inline head
 * script is part of the document, so it is always present.
 *
 * Background. Next.js names build chunks with a content hash
 * (/_next/static/chunks/<name>-<hash>.js). A client that is holding HTML from
 * an older build asks for chunks the current deployment no longer serves, and
 * the dynamic import rejects with ChunkLoadError. Before this handler, that
 * was fatal and permanent on an installed PWA: the service worker replayed
 * the old cache, Reload replayed it again, and the only escape was clearing
 * site data or reinstalling the app.
 *
 * The handler does two things, in order:
 *   1. Drops the service worker's caches, so the reload cannot be served the
 *      same stale document/chunks again.
 *   2. Reloads once. Guarded by sessionStorage so a genuinely broken build
 *      (or an offline device) can't turn into an infinite reload loop.
 */

/** sessionStorage key holding the timestamp of the last recovery reload. */
export const CHUNK_RECOVERY_KEY = "dm:chunk-recovery-at";

/** Minimum gap between recovery reloads — one attempt per 10s, then give up. */
export const CHUNK_RECOVERY_COOLDOWN_MS = 10_000;

export const CHUNK_RECOVERY_SCRIPT = `(function () {
  var KEY = ${JSON.stringify(CHUNK_RECOVERY_KEY)};
  var COOLDOWN = ${CHUNK_RECOVERY_COOLDOWN_MS};
  var PATTERNS = [
    /ChunkLoadError/i,
    /Loading chunk [^ ]+ failed/i,
    /Loading CSS chunk/i,
    /Importing a module script failed/i,
    /error loading dynamically imported module/i,
    /Failed to fetch dynamically imported module/i,
    /Unable to preload CSS/i
  ];

  function looksLikeChunkFailure(text) {
    if (!text) return false;
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].test(String(text))) return true;
    }
    return false;
  }

  function reloadOnce() {
    var already;
    try {
      already = Number(sessionStorage.getItem(KEY) || 0);
    } catch (e) {
      already = 0;
    }
    if (already && Date.now() - already < COOLDOWN) return;
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch (e) {}

    var done = false;
    function go() {
      if (done) return;
      done = true;
      window.location.reload();
    }

    try {
      if (window.caches && caches.keys) {
        caches
          .keys()
          .then(function (keys) {
            return Promise.all(
              keys.map(function (k) {
                return k.indexOf("dm") === 0 ? caches.delete(k) : null;
              })
            );
          })
          .then(go, go);
        // Never hang the recovery on a slow/blocked Cache API call.
        setTimeout(go, 1500);
        return;
      }
    } catch (e) {}
    go();
  }

  function inspect(text) {
    if (looksLikeChunkFailure(text)) reloadOnce();
  }

  // Resource load failures (a <script> that 404s) surface here with the
  // failing URL, not a message. Capture phase because these don't bubble.
  window.addEventListener(
    "error",
    function (e) {
      var t = e || {};
      var target = t.target;
      inspect(t.message || (target && (target.src || target.href)) || "");
    },
    true
  );

  // Dynamic import failures surface as an unhandled promise rejection.
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    inspect((r && (r.message || r.name)) || String(r || ""));
  });
})();`;
