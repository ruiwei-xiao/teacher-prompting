import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { postDocSnapshot } from "@/lib/calibration-api/space";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; docKind: string }> }
) {
  try {
    const { teamId, docKind } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await postDocSnapshot(userId, teamId, docKind, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to save document snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
