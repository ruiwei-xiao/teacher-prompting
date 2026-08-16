/**
 * Generate a scoreable transcript draft from the selected sample bot.
 * Reuses the same simulated-learner dialogue loop as editor test cases.
 */
import { getAppById } from "@/lib/app-store/store";
import { normalizeVariability } from "@/lib/app-store/model-selection";
import type { AppConfig } from "@/lib/app-store/types";
import { DEFAULT_TEST_CASE_STUDENTS } from "@/lib/test-case-students";
import {
  generateOneDialogue,
  type GenerateDialogueArgs,
} from "@/lib/test-cases/generate-dialogue";
import { formatTranscriptExcerpt } from "@/lib/calibration-ui/transcript";
import type { ApiResult } from "./offerings";

export const TRANSCRIPT_DRAFT_ROUNDS = 3;

export type GenerateDialogueFn = (
  args: GenerateDialogueArgs
) => Promise<Array<{ role: string; content: string }>>;

export type GetAppByIdFn = (
  id: string,
  ownerId?: string
) => Promise<AppConfig | null | undefined>;

function unauthorized(): ApiResult<never> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function notFound(message: string): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function readSampleAppId(input: unknown): string | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Missing sampleAppId" };
  }
  const value = (input as { sampleAppId?: unknown }).sampleAppId;
  if (typeof value !== "string" || !value.trim()) {
    return { error: "Missing sampleAppId" };
  }
  return value.trim();
}

function readDeploymentBrief(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const value = (input as { deploymentBrief?: unknown }).deploymentBrief;
  return typeof value === "string" ? value.trim() : "";
}

export function transcriptScenarioSummary(deploymentBrief: string): string {
  const context = deploymentBrief
    ? `Classroom context:\n${deploymentBrief.slice(0, 800)}`
    : "A typical classroom tutoring session with this bot.";
  return [
    context,
    "Stay in character as a learner who wants help, shows partial understanding, and once asks for a direct answer.",
    "Keep each message short so the resulting transcript can be scored as a single excerpt.",
  ].join("\n");
}

export async function generateTranscriptDraft(
  userId: string | null,
  input: unknown,
  deps: {
    getAppById?: GetAppByIdFn;
    generateDialogue?: GenerateDialogueFn;
  } = {}
): Promise<ApiResult<{ transcriptExcerpt: string }>> {
  if (!userId) return unauthorized();

  const sampleAppId = readSampleAppId(input);
  if (typeof sampleAppId !== "string") {
    return badRequest(sampleAppId.error);
  }

  const loadApp = deps.getAppById ?? getAppById;
  const app = await loadApp(sampleAppId, userId);
  if (!app) {
    return notFound("Sample bot not found");
  }
  if (!app.apiKey?.trim()) {
    return badRequest("Sample bot has no API key");
  }
  const systemPrompt = (app.systemPrompt ?? "").trim();
  if (!systemPrompt) {
    return badRequest("Sample bot has no system prompt");
  }

  const deploymentBrief = readDeploymentBrief(input);
  const profile =
    DEFAULT_TEST_CASE_STUDENTS[1] ?? DEFAULT_TEST_CASE_STUDENTS[0];
  if (!profile) {
    return badRequest("No learner profile available");
  }

  const generate = deps.generateDialogue ?? generateOneDialogue;
  const messages = await generate({
    provider: app.provider,
    model: app.model,
    apiKey: app.apiKey,
    variability: normalizeVariability(app.variability),
    baseSystemPrompt: systemPrompt,
    appName: app.name || sampleAppId,
    profile,
    scenarioSummary: transcriptScenarioSummary(deploymentBrief),
    purposeLabel: "Scoreable excerpt",
    rounds: TRANSCRIPT_DRAFT_ROUNDS,
  });

  const transcriptExcerpt = formatTranscriptExcerpt(messages);
  if (!transcriptExcerpt) {
    return badRequest("Generated transcript was empty");
  }

  return { ok: true, status: 200, body: { transcriptExcerpt } };
}
