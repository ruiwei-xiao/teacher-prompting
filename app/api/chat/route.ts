import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import { sendChat } from "@/lib/ai/providers";
import { normalizeVariability } from "@/lib/app-store/model-selection";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

type VisualizationState =
  | {
      mode?: "code-tracing";
      data?: {
        code?: string;
        activeStep?: number;
        totalSteps?: number;
        currentStatement?: string;
        currentState?: Record<string, string>;
        output?: string[];
      };
    }
  | {
      mode?: "virtual-lab";
      data?: {
        equation?: string;
        title?: string;
        effectType?: "gas" | "neutralization" | "precipitate" | "general";
        reactants?: { label: string; amount: number }[];
        additions?: { reagent: string; amount: number }[];
        reactionProgress?: number;
        visibleOutcome?: string;
        expectedProducts?: string[];
      };
    };

function buildVisualizationContext(visualizationState?: VisualizationState) {
  if (!visualizationState?.mode || !visualizationState.data) return "";

  if (visualizationState.mode === "code-tracing") {
    const data = visualizationState.data as {
      code?: string;
      activeStep?: number;
      totalSteps?: number;
      currentStatement?: string;
      currentState?: Record<string, string>;
      output?: string[];
    };
    return [
      "## Current interactive code tracing state",
      `- Code snippet: ${data.code || "Unknown"}`,
      `- Active step: ${(data.activeStep ?? 0) + 1} of ${data.totalSteps ?? 0}`,
      `- Current statement: ${data.currentStatement || "Unknown"}`,
      `- Current runtime state: ${JSON.stringify(data.currentState || {})}`,
      `- Current output: ${JSON.stringify(data.output || [])}`,
      "",
      "Use this tracing state to ground your tutoring response. Refer to the learner's current execution step instead of responding as if no trace exists.",
    ].join("\n");
  }

  const data = visualizationState.data as {
    equation?: string;
    title?: string;
    effectType?: "gas" | "neutralization" | "precipitate" | "general";
    reactants?: { label: string; amount: number }[];
    additions?: { reagent: string; amount: number }[];
    reactionProgress?: number;
    visibleOutcome?: string;
    expectedProducts?: string[];
  };
  return [
    "## Current interactive virtual lab state",
    `- Equation: ${data.equation || "Unknown"}`,
    `- Lab title: ${data.title || "Virtual lab"}`,
    `- Reaction type: ${data.effectType || "general"}`,
    `- Reactant totals: ${JSON.stringify(data.reactants || [])}`,
    `- Recent additions: ${JSON.stringify(data.additions || [])}`,
    `- Reaction progress: ${data.reactionProgress ?? 0}%`,
    `- Visible outcome: ${data.visibleOutcome || "None"}`,
    `- Expected products: ${JSON.stringify(data.expectedProducts || [])}`,
    "",
    "Use this lab state to ground your tutoring response. Refer to what the learner has already mixed, observed, or generated in the virtual lab.",
  ].join("\n");
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

export async function POST(req: NextRequest) {
  try {
    const { appId, system, messages, visualizationState } = (await req.json()) as {
      appId?: string;
      system?: string;
      messages?: { role: "user" | "assistant"; content: string }[];
      visualizationState?: VisualizationState;
    };

    if (!appId) {
      return NextResponse.json({ error: "Missing appId" }, { status: 400 });
    }

    const session = await auth();
    const isPublishedRequest = !system?.trim();
    const userId = session?.user?.id;

    if (!isPublishedRequest && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const app = isPublishedRequest
      ? await getAppById(appId)
      : await getAppById(appId, userId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const isPublishedChat = isPublishedRequest && Boolean(app.publishedAt);
    if (!isPublishedChat && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPublishedChat && isPublishedRequest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!app.apiKey) {
      return NextResponse.json(
        { error: `Missing API key for app "${appId}"` },
        { status: 500 }
      );
    }

    const visualizationContext = buildVisualizationContext(visualizationState);
    const effectiveSystem = [system?.trim() ? system : app.systemPrompt, visualizationContext]
      .filter(Boolean)
      .join("\n\n");

    const reply = await sendChat({
      provider: app.provider,
      model: app.model,
      apiKey: app.apiKey,
      system: effectiveSystem,
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