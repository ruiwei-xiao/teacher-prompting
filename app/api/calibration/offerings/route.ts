import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOffering,
  listMyOfferings,
} from "@/lib/calibration-api/offerings";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await listMyOfferings(userId);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await createOffering(userId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to create offering";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
