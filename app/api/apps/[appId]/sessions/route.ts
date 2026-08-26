import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listOwnerSessions } from "@/lib/chat-session-api/owner-sessions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const url = new URL(req.url);
    const result = await listOwnerSessions(userId, appId, {
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
      surface: url.searchParams.get("surface"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to list sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
