import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listWorkspaceSessions } from "@/lib/workspace-api/workspaces-sessions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await listWorkspaceSessions(userId, workspaceId, {
    limit: req.nextUrl.searchParams.get("limit"),
    offset: req.nextUrl.searchParams.get("offset"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
