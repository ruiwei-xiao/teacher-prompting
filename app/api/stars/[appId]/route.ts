import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { starBot, unstarBot } from "@/lib/star-api/stars";

export async function PUT(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await starBot(userId, appId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to star bot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const result = await unstarBot(userId, appId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to unstar bot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
