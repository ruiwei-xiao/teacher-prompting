import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { postScores } from "@/lib/calibration-api/scores";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await postScores(userId, teamId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to submit scores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
