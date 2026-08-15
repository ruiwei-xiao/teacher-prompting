import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { issueLiveblocksToken } from "@/lib/calibration-api/liveblocks-auth";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await issueLiveblocksToken(userId, body, {
      identity: {
        name: session?.user?.name ?? session?.user?.email ?? null,
      },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to authorize Liveblocks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
