import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import { normalizeVariability } from "@/lib/app-store/model-selection";
import type { StudentProfile } from "@/lib/test-case-students";
import { generateOneDialogue } from "@/lib/test-cases/generate-dialogue";

export const runtime = "nodejs";
export const maxDuration = 120;

type CaseInput = {
  caseId: string;
  profile: StudentProfile;
  scenarioSummary: string;
  purposeLabel: string;
};

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
