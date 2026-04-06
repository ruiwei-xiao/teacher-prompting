import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import {
  buildFunctionPlotChart,
  fetchFunctionPlotPngFromQuickChart,
} from "@/lib/math/function-plot";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      appId?: string;
      assistantMessage?: string;
    };
    const appId = typeof body.appId === "string" ? body.appId.trim() : "";
    const assistantMessage =
      typeof body.assistantMessage === "string" ? body.assistantMessage : "";
    if (!appId) {
      return NextResponse.json({ error: "Missing appId" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (userId) {
      const owned = await getAppById(appId, userId);
      if (!owned) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      const pub = await getAppById(appId);
      if (!pub?.publishedAt) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const built = buildFunctionPlotChart(assistantMessage);
    if (!built.ok) {
      if (built.reason === "no_expression") {
        return NextResponse.json(
          { ok: false, reason: "no_expression" },
          { status: 200 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          reason: built.reason,
          rhs: "rhs" in built ? built.rhs : undefined,
        },
        { status: 200 }
      );
    }

    const png = await fetchFunctionPlotPngFromQuickChart(built.chart);
    const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;

    return NextResponse.json({
      ok: true,
      rhs: built.rhs,
      imageDataUrl,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to render plot";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
