import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listWorkspacePlacements,
  placeWorkspaceBot,
  unplaceWorkspaceBot,
} from "@/lib/workspace-api/workspaces-placements";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await listWorkspacePlacements(userId, workspaceId);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await placeWorkspaceBot(userId, workspaceId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to place bot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await unplaceWorkspaceBot(userId, workspaceId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to unplace bot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
