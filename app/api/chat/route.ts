import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime (not edge)

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export async function GET() {
  // Quick health check: http://localhost:3000/api/chat
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

export async function POST(req: NextRequest) {
  try {
    const { system, messages } = (await req.json()) as {
      system?: string;
      messages?: { role: "user" | "assistant"; content: string }[];
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY on server" },
        { status: 500 }
      );
    }

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system || "You are a helpful assistant." },
        ...((messages ?? []) as ChatMsg[]),
      ],
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const contentType = r.headers.get("content-type") || "";
    const isJSON = contentType.includes("application/json");
    const body = isJSON ? await r.json() : await r.text();

    if (!r.ok) {
      const detail = isJSON
        ? body?.error?.message || JSON.stringify(body)
        : String(body).slice(0, 400);
      return NextResponse.json(
        { error: `Upstream error (${r.status}): ${detail}` },
        { status: r.status }
      );
    }

    const reply = isJSON ? body?.choices?.[0]?.message?.content ?? "" : String(body);
    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error("API /api/chat error:", e);
    return NextResponse.json(
      { error: e?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
