import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { acceptInviteByTokenApi } from "@/lib/workspace-api/workspaces-invites";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await acceptInviteByTokenApi(userId, token);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to accept invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
