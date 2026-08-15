import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTeamAccess } from "@/lib/calibration-api/offerings";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const result = await getTeamAccess(userId, teamId);
  return NextResponse.json(result.body, { status: result.status });
}
