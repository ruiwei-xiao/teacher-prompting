import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import { sendChat, type ChatMsg } from "@/lib/ai/providers";
import { normalizeVariability } from "@/lib/app-store/model-selection";
import {
  buildCaseSpecificPrompt,
  formatStudentProfile,
  type StudentProfile,
} from "@/lib/test-case-students";
import { getWelcomeMessage } from "@/lib/chat/welcome-message";

export const runtime = "nodejs";
export const maxDuration = 120;

type CaseInput = {
  caseId: string;
  profile: StudentProfile;
  scenarioSummary: string;
  purposeLabel: string;
};

function sanitizeLine(text: string) {
  let t = text.trim();
  t = t.replace(/^(learner|student|user)\s*:\s*/i, "").trim();
  t = t.replace(/^["']|["']$/g, "").trim();
  return t.slice(0, 4000) || "…";
}

function buildStudentSystemPrompt(
  profile: StudentProfile,
  scenarioSummary: string,
  purposeLabel: string
) {
  return [
    "You role-play exactly one learner in an online tutoring chat.",
    "Reply with ONLY the learner's next chat message: plain text, 1–5 short sentences.",
    "Rules: no character names as labels, no quotes, no meta-commentary, no prefixes like Student: or Learner:.",
    "",
    formatStudentProfile(profile),
    "",
    `Test case type: ${purposeLabel}`,
    `Scenario focus: ${scenarioSummary}`,
  ].join("\n");
}

function buildStudentUserPayload(
  transcript: ChatMsg[],
  roundIndex: number
) {
  // Production chats always open with a static tutor welcome, then the learner types.
  if (transcript.length === 0) {
    return "The tutoring session just started. Write the learner's opening message to the tutor—what they type first in the chat box.";
  }
  const lines = transcript.map((m) =>
    m.role === "assistant"
      ? `Tutor: ${m.content}`
      : `Learner (you): ${m.content}`
  );
  return [
    "Conversation so far:",
    ...lines,
    "",
    roundIndex === 0
      ? "The tutor already sent a welcome message (as in the live student chat). Write ONLY the learner's first reply in the chat box."
      : "Write ONLY the learner's very next reply (what they type next).",
  ].join("\n");
}

async function generateOneDialogue(args: {
  provider: "openai" | "google" | "anthropic";
  model: string;
  apiKey: string;
  variability: number;
  baseSystemPrompt: string;
  appName: string;
  profile: StudentProfile;
  scenarioSummary: string;
  purposeLabel: string;
  rounds: number;
}): Promise<ChatMsg[]> {
  const {
    provider,
    model,
    apiKey,
    variability,
    baseSystemPrompt,
    appName,
    profile,
    scenarioSummary,
    purposeLabel,
    rounds,
  } = args;

  const tutorSystem = buildCaseSpecificPrompt(baseSystemPrompt, profile);
  const studentSystem = buildStudentSystemPrompt(
    profile,
    scenarioSummary,
    purposeLabel
  );

  // Same static welcome as published / try-chat — not model-generated.
  const transcript: ChatMsg[] = [
    { role: "assistant", content: getWelcomeMessage(appName) },
  ];

  for (let r = 0; r < rounds; r += 1) {
    const studentPayload = buildStudentUserPayload(transcript, r);
    const rawStudent = await sendChat({
      provider,
      model,
      apiKey,
      variability,
      system: studentSystem,
      messages: [{ role: "user", content: studentPayload }],
    });
    const userLine = sanitizeLine(rawStudent);
    transcript.push({ role: "user", content: userLine });

    const rawTutor = await sendChat({
      provider,
      model,
      apiKey,
      variability,
      system: tutorSystem,
      messages: transcript.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    transcript.push({
      role: "assistant",
      content: sanitizeLine(rawTutor),
    });
  }

  return transcript;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      appId?: string;
      systemPrompt?: string;
      rounds?: number;
      cases?: CaseInput[];
    };

    const appId = body.appId?.trim();
    if (!appId) {
      return NextResponse.json({ error: "Missing appId" }, { status: 400 });
    }

    const cases = Array.isArray(body.cases) ? body.cases : [];
    if (!cases.length) {
      return NextResponse.json({ error: "Missing cases" }, { status: 400 });
    }

    const app = await getAppById(appId, userId);
    if (!app?.apiKey) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const baseSystem =
      typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    if (!baseSystem) {
      return NextResponse.json(
        { error: "Missing or empty systemPrompt" },
        { status: 400 }
      );
    }

    const rounds =
      typeof body.rounds === "number" && body.rounds >= 1 && body.rounds <= 8
        ? body.rounds
        : 5;

    const variability = normalizeVariability(app.variability);

    const results: { caseId: string; messages: { role: string; content: string }[] }[] =
      [];

    for (const c of cases) {
      if (!c?.caseId || !c.profile) {
        return NextResponse.json(
          { error: "Each case needs caseId and profile" },
          { status: 400 }
        );
      }
      const transcript = await generateOneDialogue({
        provider: app.provider,
        model: app.model,
        apiKey: app.apiKey,
        variability,
        baseSystemPrompt: baseSystem,
        appName: app.name || appId,
        profile: c.profile,
        scenarioSummary:
          typeof c.scenarioSummary === "string"
            ? c.scenarioSummary
            : "Simulated learner scenario.",
        purposeLabel:
          typeof c.purposeLabel === "string" ? c.purposeLabel : "Test case",
        rounds,
      });
      results.push({
        caseId: c.caseId,
        messages: transcript.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    }

    return NextResponse.json({ results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to generate dialogue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
