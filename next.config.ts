import type { NextConfig } from "next";

/**
 * A value that is different on every deployment.
 *
 * This is the missing piece behind the "installed app shows a server error"
 * bug. The service worker (public/sw.js) caches build assets and offline
 * shell responses, but its caches were named with a hand-maintained
 * constant ("dm-shell-v4"), so they survived across deployments. After a
 * redeploy the worker kept serving HTML/payloads that referenced chunk
 * hashes the new build no longer ships, the client threw ChunkLoadError,
 * and tapping Reload just replayed the same stale cache.
 *
 * That constant is now replaced by this per-deploy id, which is used for
 * two things:
 *   1. The SW is registered at /sw.js?v=<build id>, so a new deploy is a
 *      different script URL and the browser re-installs the worker.
 *   2. public/sw.js reads the same id off `self.location` and puts it in
 *      its cache names, so caches from an older build can never be reused.
 *
 * Order of preference: the Vercel commit SHA at build time (stable and
 * meaningful), an explicitly configured NEXT_PUBLIC_BUILD_ID, then the
 * build timestamp so a local/other-CI build still gets a unique id.
 */
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  String(Date.now());

// Both of these expose the id to client code (lib/sw-version.ts reads it as
// process.env.NEXT_PUBLIC_BUILD_ID). The assignment covers Next's normal
// NEXT_PUBLIC_* inlining; `env` below is the documented config option for
// the same thing. Setting both keeps the id available regardless of how the
// bundler resolves env vars.
process.env.NEXT_PUBLIC_BUILD_ID = BUILD_ID;

const nextConfig: NextConfig = {
  // Keep Prisma out of the Turbopack server bundle: the generated client
  // resolves its query engine binary from node_modules at runtime, which fails
  // when bundled into .next/server chunks (Vercel build: "Failed to collect
  // page data for /api/alarms/check", PrismaClientInitializationError).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],

  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
};

export default nextConfig;
