import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSessionTranscript } from "@/lib/chat-session-api/transcript";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await getSessionTranscript(userId, sessionId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to load session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
