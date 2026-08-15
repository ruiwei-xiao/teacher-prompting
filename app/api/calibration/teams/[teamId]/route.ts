import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSpace } from "@/lib/calibration-api/space";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getSpace(userId, teamId);
  return NextResponse.json(result.body, { status: result.status });
}
