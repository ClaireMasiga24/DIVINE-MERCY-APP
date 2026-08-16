import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma out of the Turbopack server bundle: the generated client
  // resolves its query engine binary from node_modules at runtime, which fails
  // when bundled into .next/server chunks (Vercel build: "Failed to collect
  // page data for /api/alarms/check", PrismaClientInitializationError).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
