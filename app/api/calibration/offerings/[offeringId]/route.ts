import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOfferingGate } from "@/lib/calibration-api/offerings";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  const { offeringId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getOfferingGate(userId, offeringId);
  return NextResponse.json(result.body, { status: result.status });
}
