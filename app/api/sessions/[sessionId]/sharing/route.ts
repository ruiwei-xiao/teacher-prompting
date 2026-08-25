import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { optOutSharing } from "@/lib/chat-session-api/sharing";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await optOutSharing(userId, sessionId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update sharing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
