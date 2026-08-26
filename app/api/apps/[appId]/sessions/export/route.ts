import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { exportOwnerSessions } from "@/lib/chat-session-api/export";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const url = new URL(req.url);
    const result = await exportOwnerSessions(
      userId,
      appId,
      url.searchParams.get("format"),
      {},
      {
        surface: url.searchParams.get("surface"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }
    );
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }
    return new NextResponse(result.body.body, {
      status: 200,
      headers: {
        "Content-Type": result.body.contentType,
        "Content-Disposition": `attachment; filename="${result.body.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to export sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
