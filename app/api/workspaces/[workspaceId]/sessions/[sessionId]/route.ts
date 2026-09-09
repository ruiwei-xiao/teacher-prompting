import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceSessionTranscript } from "@/lib/workspace-api/workspaces-sessions";

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; sessionId: string }> }
) {
  const { workspaceId, sessionId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getWorkspaceSessionTranscript(
    userId,
    workspaceId,
    sessionId
  );
  return NextResponse.json(result.body, { status: result.status });
}
