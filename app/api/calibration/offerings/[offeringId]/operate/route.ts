import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getOperatorDashboard,
  patchOperatorFacilitatorKey,
} from "@/lib/calibration-api/operator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  try {
    const { offeringId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await getOperatorDashboard(userId, offeringId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load operator dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ offeringId: string }> }
) {
  try {
    const { offeringId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json().catch(() => ({}));
    const result = await patchOperatorFacilitatorKey(userId, offeringId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update facilitator key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
