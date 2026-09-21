import { NextResponse } from "next/server";
import { ensureAnonymousVisitorCookie } from "@/lib/public-chat-identity/cookie";

export async function POST() {
  try {
    await ensureAnonymousVisitorCookie();
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to issue visitor cookie";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
