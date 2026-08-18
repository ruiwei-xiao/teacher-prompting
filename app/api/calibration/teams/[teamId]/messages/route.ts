import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { personOverlayFromUser } from "@/lib/auth/resolve-labels";
import { postMessage } from "@/lib/calibration-api/space";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await postMessage(userId, teamId, body, {
      identity: personOverlayFromUser(session?.user),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to post message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
