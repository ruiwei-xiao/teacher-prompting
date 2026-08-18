import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listWorkspaceMembers,
  patchWorkspaceMembers,
  removeWorkspaceMember,
} from "@/lib/workspace-api/workspaces-members";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const result = await listWorkspaceMembers(userId, workspaceId, q, {
    email: session?.user?.email ?? null,
    name: session?.user?.name ?? null,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await patchWorkspaceMembers(userId, workspaceId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update members";
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
    const result = await removeWorkspaceMember(userId, workspaceId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to remove member";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
