import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateTranscriptDraft } from "@/lib/calibration-api/transcript";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json().catch(() => ({}));
    const result = await generateTranscriptDraft(userId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to generate transcript";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
