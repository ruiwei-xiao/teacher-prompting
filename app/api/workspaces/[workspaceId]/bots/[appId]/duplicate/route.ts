import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { duplicateWorkspaceBot } from "@/lib/workspace-api/workspaces-bots";

export async function POST(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ workspaceId: string; appId: string }> }
) {
  try {
    const { workspaceId, appId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await duplicateWorkspaceBot(userId, workspaceId, appId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to duplicate bot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
