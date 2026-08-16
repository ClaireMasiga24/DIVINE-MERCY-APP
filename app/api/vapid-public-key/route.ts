import { NextResponse } from "next/server";

/**
 * Exposes the VAPID public key to the client (it is public by design — it is
 * embedded in every push subscription). Returns null when push isn't
 * configured, so the client can hide the alarm setup UI.
 */
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}
