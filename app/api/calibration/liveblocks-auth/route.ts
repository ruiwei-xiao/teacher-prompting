import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  personOverlayFromUser,
  rememberSessionPerson,
} from "@/lib/auth/resolve-labels";
import { issueLiveblocksToken } from "@/lib/calibration-api/liveblocks-auth";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const overlay = personOverlayFromUser(session?.user);
    await rememberSessionPerson(userId, overlay);
    const body = await req.json();
    const result = await issueLiveblocksToken(userId, body, {
      identity: {
        name: overlay?.name ?? overlay?.email ?? null,
        avatar: overlay?.image ?? null,
      },
    });
    // Liveblocks expects the raw authorize() body, not a re-wrapped JSON object.
    if (result.ok && result.rawAuthorizeBody) {
      return new Response(result.rawAuthorizeBody, {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to authorize Liveblocks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
