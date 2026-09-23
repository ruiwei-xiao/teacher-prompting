import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimVisitorIdentity } from "@/lib/public-chat-identity/claim-api";

export async function POST() {
  try {
    const session = await auth();
    const result = await claimVisitorIdentity(session?.user?.id ?? null);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: unknown) {
    console.error("Failed to claim anonymous visitor history:", error);
    return NextResponse.json(
      { error: "Failed to claim visitor history" },
      { status: 500 }
    );
  }
}
