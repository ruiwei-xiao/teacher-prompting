import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import { sendChat } from "@/lib/ai/providers";
import { normalizeVariability } from "@/lib/app-store/model-selection";

export const runtime = "nodejs";

type SectionKey = "objective" | "exercises" | "profile" | "template";

type BuilderContext = {
  learningObjective?: string;
  uploadedExerciseName?: string;
  uploadedExerciseText?: string;
  gradeLevel?: string;
  language?: string;
  learnerNotes?: string;
  selectedTemplate?: string;
};

const SECTION_PROMPTS: Record<
  SectionKey,
  {
    label: string;
    guidance: string;
    outputHint: string;
  }
> = {
  objective: {
    label: "Learning objective agent",
    guidance:
      "Rewrite the teacher's rough learning objective into a concise, instruction-ready section for a system prompt. Preserve the teacher's intent, make the pedagogical goal explicit, and clarify what successful student learning should look like.",
    outputHint:
      "Return only markdown prose or bullets for the learning objective section. Do not include any preamble.",
  },
  exercises: {
    label: "Learning materials agent",
    guidance:
      "Turn the pasted links or uploaded learning materials into prompt-ready instructional context. Summarize what materials exist, what concepts they cover, how the tutor should reuse them, and any useful constraints or patterns.",
    outputHint:
      "Return only markdown for the reference learning materials section. If the input is sparse, produce a short fallback note that the tutor should ask for more material detail later.",
  },
  profile: {
    label: "Learner profile agent",
    guidance:
      "Convert the learner profile details into a prompt-ready teaching profile. Make it useful for an AI tutor by describing reading level, language needs, scaffolding expectations, pacing, and instructional tone.",
    outputHint:
      "Return only markdown for the learner profile section. Keep it short and actionable.",
  },
  template: {
    label: "Template adaptation agent",
    guidance:
      "Adapt the selected teaching template into customized instructions for this specific bot. Use the learning objective, learner profile, and exercise context to produce a short set of template-specific directions that can be appended to the template.",
    outputHint:
      "Return only markdown for template adaptation notes. Do not repeat the full template unless necessary.",
  },
};

function buildSectionInput(section: SectionKey, context: BuilderContext) {
  if (section === "objective") {
    return context.learningObjective?.trim() || "";
  }

  if (section === "exercises") {
    return [context.uploadedExerciseName?.trim(), context.uploadedExerciseText?.trim()]
      .filter(Boolean)
      .join("\n\n");
  }

  if (section === "profile") {
    return [
      `Grade level: ${context.gradeLevel || "Not specified"}`,
      `Language: ${context.language || "Not specified"}`,
      `Additional notes: ${context.learnerNotes?.trim() || "None provided"}`,
    ].join("\n");
  }

  return [
    `Selected template: ${context.selectedTemplate || "None selected"}`,
    `Learning objective: ${context.learningObjective?.trim() || "Not provided"}`,
    `Learner profile notes: ${context.learnerNotes?.trim() || "None provided"}`,
    `Grade level: ${context.gradeLevel || "Not specified"}`,
    `Language: ${context.language || "Not specified"}`,
    `Existing exercises: ${context.uploadedExerciseText?.trim() || "None provided"}`,
  ].join("\n");
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
      section?: SectionKey;
      context?: BuilderContext;
    };

    if (!body.appId) {
      return NextResponse.json({ error: "Missing appId" }, { status: 400 });
    }

    if (!body.section || !(body.section in SECTION_PROMPTS)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const app = await getAppById(body.appId, userId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    if (!app.apiKey) {
      return NextResponse.json({ error: "Missing API key for this app" }, { status: 400 });
    }

    const sectionConfig = SECTION_PROMPTS[body.section];
    const context = body.context || {};
    const sectionInput = buildSectionInput(body.section, context);
    if (!sectionInput.trim()) {
      return NextResponse.json(
        { error: `Add some ${sectionConfig.label.toLowerCase()} input first.` },
        { status: 400 }
      );
    }

    const system = [
      `You are the ${sectionConfig.label} inside a prompt-building tool for teachers.`,
      sectionConfig.guidance,
      sectionConfig.outputHint,
      "Be faithful to the teacher's intent.",
      "Write in clear markdown that can be inserted directly into a system prompt.",
    ].join("\n\n");

    const userMessage = [
      `Section to refine: ${body.section}`,
      "",
      "Current builder context:",
      `- Learning objective: ${context.learningObjective?.trim() || "Not provided"}`,
      `- Exercise file: ${context.uploadedExerciseName?.trim() || "None"}`,
      `- Grade level: ${context.gradeLevel || "Not specified"}`,
      `- Language: ${context.language || "Not specified"}`,
      `- Learner notes: ${context.learnerNotes?.trim() || "None provided"}`,
      `- Selected template: ${context.selectedTemplate || "None selected"}`,
      "",
      "Raw section input:",
      sectionInput,
    ].join("\n");

    const draft = await sendChat({
      provider: app.provider,
      model: app.model,
      apiKey: app.apiKey,
      variability: normalizeVariability(app.variability),
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    return NextResponse.json({ draft: draft.trim() });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to draft section" },
      { status: 500 }
    );
  }
}
