import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/**
 * Registers a web push subscription for the signed-in user. The subscription
 * endpoint is the unique DeviceToken.token; the p256dh/auth keys are stored
 * alongside so the server can send notifications (web-push requires all three).
 */
export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { subscription?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sub = body.subscription as
    | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
    | undefined;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const authKey = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: "Invalid subscription endpoint." }, { status: 400 });
  }
  const isSecure = url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isSecure) {
    return NextResponse.json(
      { error: "Push subscriptions require a secure (HTTPS) origin." },
      { status: 400 }
    );
  }

  await prisma.deviceToken.upsert({
    where: { token: endpoint },
    update: { userId: sessionUser.id, p256dh, authKey, platform: "web" },
    create: { userId: sessionUser.id, token: endpoint, p256dh, authKey, platform: "web" },
  });

  return NextResponse.json({ ok: true });
}
