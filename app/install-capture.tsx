"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/install-store";

/**
 * Mounts in the root layout. Starts the global
 * `beforeinstallprompt` capture as early as possible so the event is
 * never lost — even on a returning user who lands on `/` for a few
 * hundred milliseconds before the auth redirect.
 *
 * Idempotent: multiple mounts across nested layouts only capture once.
 */
export default function InstallCapture() {
  useEffect(() => {
    startInstallCapture();
  }, []);
  return null;
}
