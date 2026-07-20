import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteWorkspaceById,
  getWorkspaceById,
  updateWorkspaceById,
} from "@/lib/workspace-api/workspaces-crud";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getWorkspaceById(userId, workspaceId);
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
    const result = await updateWorkspaceById(userId, workspaceId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await deleteWorkspaceById(userId, workspaceId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to delete workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
