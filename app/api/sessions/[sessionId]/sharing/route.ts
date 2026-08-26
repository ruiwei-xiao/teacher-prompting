import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateSharing } from "@/lib/chat-session-api/sharing";

function requestedShared(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  return (body as { shared?: unknown }).shared === true;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json().catch(() => ({}));
    const result = await updateSharing(
      userId,
      sessionId,
      requestedShared(body)
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update sharing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
