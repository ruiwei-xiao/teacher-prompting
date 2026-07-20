import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceBotSnapshot } from "@/lib/workspace-api/workspaces-bots";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ workspaceId: string; appId: string }> }
) {
  const { workspaceId, appId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getWorkspaceBotSnapshot(userId, workspaceId, appId);
  return NextResponse.json(result.body, { status: result.status });
}
