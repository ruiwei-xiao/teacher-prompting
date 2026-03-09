import { NextRequest, NextResponse } from "next/server";
import { getAppById } from "@/lib/app-store/store";
import { sendChat } from "@/lib/ai/providers";
import { normalizeVariability } from "@/lib/app-store/model-selection";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

export async function POST(req: NextRequest) {
  try {
    const { appId, system, messages } = (await req.json()) as {
      appId?: string;
      system?: string;
      messages?: { role: "user" | "assistant"; content: string }[];
    };

    if (!appId) {
      return NextResponse.json({ error: "Missing appId" }, { status: 400 });
    }

    const app = await getAppById(appId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    if (!app.apiKey) {
      return NextResponse.json(
        { error: `Missing API key for app "${appId}"` },
        { status: 500 }
      );
    }

    const reply = await sendChat({
      provider: app.provider,
      model: app.model,
      apiKey: app.apiKey,
      system: system?.trim() ? system : app.systemPrompt,
      variability: normalizeVariability(app.variability),
      messages: (messages ?? []) as ChatMsg[],
    });

    return NextResponse.json({
      reply,
      provider: app.provider,
      model: app.model,
    });
  } catch (e: any) {
    console.error("API /api/chat error:", e);
    return NextResponse.json(
      { error: e?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}