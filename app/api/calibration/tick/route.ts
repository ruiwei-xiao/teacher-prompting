import { NextResponse } from "next/server";
import { postTick } from "@/lib/calibration-api/tick";

async function handleTick(req: Request) {
  try {
    const result = await postTick(req.headers);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to run tick";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes GET; the design contract is also POST. */
export async function GET(req: Request) {
  return handleTick(req);
}

export async function POST(req: Request) {
  return handleTick(req);
}
