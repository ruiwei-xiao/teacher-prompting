import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listWorkspaceActivity } from "@/lib/workspace-api/workspaces-activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await listWorkspaceActivity(userId, workspaceId);
  return NextResponse.json(result.body, { status: result.status });
}
