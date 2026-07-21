import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listStars } from "@/lib/star-api/stars";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await listStars(userId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to list stars";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
