import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMySessions } from "@/lib/chat-session-api/my-sessions";

export async function GET(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const url = new URL(req.url);
    const result = await listMySessions(userId, {
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to list sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
