import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { postCheckIn } from "@/lib/calibration-api/queue";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  try {
    const { offeringId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await postCheckIn(userId, offeringId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to check in";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
