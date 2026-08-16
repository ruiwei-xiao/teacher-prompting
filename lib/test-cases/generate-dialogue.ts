/**
 * Shared simulated-learner ↔ tutor dialogue generation.
 * Used by editor test cases and activity transcript drafts.
 */
import { sendChat, type ChatMsg } from "@/lib/ai/providers";
import {
  buildCaseSpecificPrompt,
  formatStudentProfile,
  type StudentProfile,
} from "@/lib/test-case-students";
import { getWelcomeMessage } from "@/lib/chat/welcome-message";
import type { SupportedProvider } from "@/lib/app-store/types";

export type GenerateDialogueArgs = {
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  variability: number;
  baseSystemPrompt: string;
  appName: string;
  profile: StudentProfile;
  scenarioSummary: string;
  purposeLabel: string;
  rounds: number;
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

function buildStudentUserPayload(transcript: ChatMsg[], roundIndex: number) {
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

export async function generateOneDialogue(
  args: GenerateDialogueArgs
): Promise<ChatMsg[]> {
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
