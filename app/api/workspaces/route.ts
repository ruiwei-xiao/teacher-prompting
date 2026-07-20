import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createWorkspaces,
  listWorkspaces,
} from "@/lib/workspace-api/workspaces-crud";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await listWorkspaces(userId);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const body = await req.json();
    const result = await createWorkspaces(userId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to create workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
