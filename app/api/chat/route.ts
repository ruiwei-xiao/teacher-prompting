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
      mode?: "music-staff";
      data?: {
        clef?: "treble";
        selectedNote?: string;
        selectedDuration?: "quarter" | "half";
        lastInteraction?: string;
        notes?: { pitch: string; slot: number; duration: "quarter" | "half" }[];
        melody?: string[];
      };
    }
  | {
      mode?: "spacing-testing";
      data?: {
        deckTitle?: string;
        activeCard?: number;
        flipped?: boolean;
        studyMoments?: string[];
        cards?: {
          id?: string;
          front?: string;
          back?: string;
          status?: "new" | "hard" | "easy";
        }[];
        lastInteraction?: string;
      };
    }
  | {
      mode?: "dyslexia-support";
      data?: {
        sourceText?: string;
        adaptedText?: string;
        displayMode?: "chunked" | "spaced" | "guided-writing";
        fontMode?: "default" | "opendyslexic-style";
        spacingPreset?: "standard" | "comfortable" | "maximum";
        lineFocusEnabled?: boolean;
        maskEnabled?: boolean;
        syllableHighlight?: boolean;
        autoReadFocusedChunk?: boolean;
        focusChunk?: number;
        activeSpokenChunk?: number | null;
        activeSpokenSentence?: number | null;
        activeSpokenChar?: number | null;
        speechRate?: number;
        selectedVoice?: string;
        speakingTarget?: "none" | "focused-chunk" | "full-preview";
        chunkSize?: number;
        keywords?: string[];
        sentenceFrame?: string;
        checklist?: string[];
        lastInteraction?: string;
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
      selectedExample?: string;
      activeStep?: number;
      totalSteps?: number;
      currentStatement?: string;
      currentState?: Record<string, string>;
      output?: string[];
      clickedLine?: number | null;
      lastInteraction?: string;
      recentInteractions?: string[];
    };
    return [
      "## Current interactive code tracing state",
      `- Code snippet: ${data.code || "Unknown"}`,
      `- Selected example: ${data.selectedExample || "None"}`,
      `- Active step: ${(data.activeStep ?? 0) + 1} of ${data.totalSteps ?? 0}`,
      `- Current statement: ${data.currentStatement || "Unknown"}`,
      `- Current runtime state: ${JSON.stringify(data.currentState || {})}`,
      `- Current output: ${JSON.stringify(data.output || [])}`,
      `- Clicked line: ${data.clickedLine ?? "None"}`,
      `- Last interaction: ${data.lastInteraction || "None"}`,
      `- Recent interactions: ${JSON.stringify(data.recentInteractions || [])}`,
      "",
      "Use this tracing state to ground your tutoring response. Refer to the learner's current execution step and their recent interactions in the trace UI instead of responding as if no trace exists.",
    ].join("\n");
  }

  if (visualizationState.mode === "music-staff") {
    const data = visualizationState.data as {
      clef?: "treble";
      selectedNote?: string;
      selectedDuration?: "quarter" | "half";
      lastInteraction?: string;
      notes?: { pitch: string; slot: number; duration: "quarter" | "half" }[];
      melody?: string[];
    };

    return [
      "## Current interactive music staff state",
      `- Clef: ${data.clef || "treble"}`,
      `- Selected note: ${data.selectedNote || "None"}`,
      `- Selected duration: ${data.selectedDuration || "quarter"}`,
      `- Last interaction: ${data.lastInteraction || "None"}`,
      `- Notes on staff: ${JSON.stringify(data.notes || [])}`,
      `- Current melody: ${JSON.stringify(data.melody || [])}`,
      "",
      "Use this music staff state to ground your tutoring response. Refer to the student's current notation and what they just placed or played on the staff.",
    ].join("\n");
  }

  if (visualizationState.mode === "spacing-testing") {
    const data = visualizationState.data as {
      deckTitle?: string;
      activeCard?: number;
      flipped?: boolean;
      studyMoments?: string[];
      cards?: {
        id?: string;
        front?: string;
        back?: string;
        status?: "new" | "hard" | "easy";
      }[];
      lastInteraction?: string;
    };

    const currentCard = data.cards?.[data.activeCard ?? 0];

    return [
      "## Current spacing-and-testing vocabulary flashcard state",
      `- Deck title: ${data.deckTitle || "Vocabulary flashcard deck"}`,
      `- Active card: ${(data.activeCard ?? 0) + 1} of ${data.cards?.length ?? 0}`,
      `- Card side showing: ${data.flipped ? "answer" : "question"}`,
      `- Study moments: ${JSON.stringify(data.studyMoments || [])}`,
      `- Current vocabulary word: ${currentCard?.front || "Unknown"}`,
      `- Current card answer / usage cue: ${currentCard?.back || "Unknown"}`,
      `- Current card status: ${currentCard?.status || "new"}`,
      `- All card statuses: ${JSON.stringify((data.cards || []).map((card) => ({
        front: card.front,
        status: card.status || "new",
      })))}`,
      `- Last interaction: ${data.lastInteraction || "None"}`,
      "",
      "Use this vocabulary flashcard state to ground your response. Treat the conversation as one-word-at-a-time retrieval practice, refer to the current word and card side, and bring hard words back sooner than easy ones.",
    ].join("\n");
  }

  if (visualizationState.mode === "dyslexia-support") {
    const data = visualizationState.data as {
      sourceText?: string;
      adaptedText?: string;
      displayMode?: "chunked" | "spaced" | "guided-writing";
      fontMode?: "default" | "opendyslexic-style";
      spacingPreset?: "standard" | "comfortable" | "maximum";
      lineFocusEnabled?: boolean;
      maskEnabled?: boolean;
      syllableHighlight?: boolean;
      autoReadFocusedChunk?: boolean;
      focusChunk?: number;
      activeSpokenChunk?: number | null;
      activeSpokenSentence?: number | null;
      activeSpokenChar?: number | null;
      speechRate?: number;
      selectedVoice?: string;
      speakingTarget?: "none" | "focused-chunk" | "full-preview";
      chunkSize?: number;
      keywords?: string[];
      sentenceFrame?: string;
      checklist?: string[];
      lastInteraction?: string;
    };

    return [
      "## Current dyslexia-friendly literacy support state",
      `- Original task: ${data.sourceText || "Unknown"}`,
      `- Adapted version: ${data.adaptedText || "Unknown"}`,
      `- Display mode: ${data.displayMode || "chunked"}`,
      `- Font mode: ${data.fontMode || "default"}`,
      `- Spacing preset: ${data.spacingPreset || "comfortable"}`,
      `- Line focus ruler: ${data.lineFocusEnabled ? "on" : "off"}`,
      `- Reading mask: ${data.maskEnabled ? "on" : "off"}`,
      `- Syllable highlighting: ${data.syllableHighlight ? "on" : "off"}`,
      `- Auto-read focused chunk: ${data.autoReadFocusedChunk ? "on" : "off"}`,
      `- Focused chunk: ${(data.focusChunk ?? 0) + 1}`,
      `- Active spoken chunk: ${data.activeSpokenChunk == null ? "None" : data.activeSpokenChunk + 1}`,
      `- Active spoken sentence: ${data.activeSpokenSentence == null ? "None" : data.activeSpokenSentence + 1}`,
      `- Active spoken character: ${data.activeSpokenChar == null ? "None" : data.activeSpokenChar + 1}`,
      `- Speech rate: ${data.speechRate ?? 0.9}`,
      `- Selected voice: ${data.selectedVoice || "System default"}`,
      `- Speaking target: ${data.speakingTarget || "none"}`,
      `- Chunk size: ${data.chunkSize ?? 1}`,
      `- Keywords: ${JSON.stringify(data.keywords || [])}`,
      `- Sentence frame: ${data.sentenceFrame || "None"}`,
      `- Checklist: ${JSON.stringify(data.checklist || [])}`,
      `- Last interaction: ${data.lastInteraction || "None"}`,
      "",
      "Use this literacy-support state to ground your response. Refer to the adapted text structure, keyword supports, and writing scaffold currently visible in the interface.",
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