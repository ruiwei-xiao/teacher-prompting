import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import type { SupportedProvider } from "@/lib/app-store/types";
import { sendChat } from "@/lib/ai/providers";
import { buildCaseSpecificPrompt, type StudentProfile } from "@/lib/test-case-students";

type FeedbackMessage = {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  imageUrl?: string;
};

type VerificationCaseInput = {
  id?: string;
  name?: string;
  studentProfile?: StudentProfile | null;
  messages?: FeedbackMessage[];
};

type DiffAnalysis = {
  teacherIntent: string;
  keyDifferences: string[];
  desiredBehaviors: string[];
  guardrailsToKeep: string[];
  successCriteria: string[];
};

type PromptPlan = {
  targetSections: string[];
  rewriteInstructions: string[];
  preserveSections: string[];
  rationale: string;
};

type VerificationCheck = {
  testCaseId: string;
  testCaseName: string;
  status: "pass" | "warning" | "fail";
  score: number;
  note: string;
  expectedAssistant: string;
  candidateAssistant: string;
};

type VerificationResult = {
  currentCase: VerificationCheck | null;
  otherCaseChecks: VerificationCheck[];
  regressions: string[];
  summary: string;
  shouldApply: boolean;
};

type ChangedBlock = {
  heading: string;
};

const WHOLE_PROMPT_BLOCK = "Whole prompt";

function normalizeNewlines(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/^```[\w-]*\s*/, "").replace(/\s*```$/, "").trim();
}

function stripMarkdownFormatting(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function extractJsonObject(raw: string) {
  const candidate = stripCodeFence(raw);
  try {
    return JSON.parse(candidate);
  } catch {}

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }

  throw new Error("Could not parse structured model response.");
}

function extractPromptFromText(raw: string) {
  const candidate = stripMarkdownFormatting(stripCodeFence(raw));
  return normalizeNewlines(candidate);
}

function formatTranscript(messages: FeedbackMessage[]) {
  if (!messages.length) {
    return "(empty conversation)";
  }

  return messages
    .map((message, index) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const content = normalizeNewlines(message.content || "") || "(empty)";
      const img =
        message.role === "user" && message.imageUrl?.trim()
          ? " [includes attached image]"
          : "";
      return `${index + 1}. ${role}: ${content}${img}`;
    })
    .join("\n");
}

function sanitizeMessages(messages: FeedbackMessage[]) {
  return messages
    .filter(
      (message): message is Required<Pick<FeedbackMessage, "role" | "content">> =>
        Boolean(message.role && typeof message.content === "string"),
    )
    .map((message) => ({
      role: message.role,
      content: normalizeNewlines(message.content),
    }))
    .filter((message) => message.content.length > 0);
}

function getLastUserIndex(messages: FeedbackMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

function getAssistantAfterIndex(messages: FeedbackMessage[], index: number) {
  for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
    if (messages[cursor]?.role === "assistant") {
      return normalizeNewlines(messages[cursor]?.content || "");
    }
  }
  return "";
}

function getLatestAssistant(messages: FeedbackMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return normalizeNewlines(messages[index]?.content || "");
    }
  }
  return "";
}

function prepareCurrentCase(
  originalMessages: FeedbackMessage[],
  editedMessages: FeedbackMessage[],
  studentProfile?: StudentProfile | null
) {
  const lastUserIndex = getLastUserIndex(originalMessages);
  if (lastUserIndex < 0) {
    return null;
  }

  const conversation = sanitizeMessages(originalMessages.slice(0, lastUserIndex + 1));
  const expectedAssistant =
    getAssistantAfterIndex(editedMessages, lastUserIndex) || getLatestAssistant(editedMessages);

  return {
    conversation,
    expectedAssistant,
    studentProfile: studentProfile || null,
  };
}

function prepareVerificationCase(testCase: VerificationCaseInput) {
  const messages = Array.isArray(testCase.messages) ? testCase.messages : [];
  const lastUserIndex = getLastUserIndex(messages);
  if (lastUserIndex < 0) {
    return null;
  }

  const conversation = sanitizeMessages(messages.slice(0, lastUserIndex + 1));
  const expectedAssistant =
    getAssistantAfterIndex(messages, lastUserIndex) || getLatestAssistant(messages);

  if (!conversation.length || !expectedAssistant) {
    return null;
  }

  return {
    testCaseId: testCase.id || "",
    testCaseName: testCase.name || "Untitled case",
    conversation,
    expectedAssistant,
    studentProfile: testCase.studentProfile || null,
  };
}

function parsePromptSections(prompt: string) {
  const sections = normalizeNewlines(prompt)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return sections.map((block, index) => ({
    heading: index === 0 ? WHOLE_PROMPT_BLOCK : `Block ${index + 1}`,
    body: block,
  }));
}

function getChangedBlocks(currentPrompt: string, updatedPrompt: string): ChangedBlock[] {
  const currentSections = parsePromptSections(currentPrompt);
  const updatedSections = parsePromptSections(updatedPrompt);
  if (!currentSections.length || !updatedSections.length) {
    return [{ heading: WHOLE_PROMPT_BLOCK }];
  }

  const limit = Math.max(currentSections.length, updatedSections.length);
  const changed: ChangedBlock[] = [];

  for (let index = 0; index < limit; index += 1) {
    const currentBody = currentSections[index]?.body || "";
    const updatedBody = updatedSections[index]?.body || "";
    if (normalizeNewlines(currentBody) !== normalizeNewlines(updatedBody)) {
      changed.push({
        heading: updatedSections[index]?.heading || currentSections[index]?.heading || WHOLE_PROMPT_BLOCK,
      });
    }
  }

  return changed.length ? changed : [{ heading: WHOLE_PROMPT_BLOCK }];
}

function mergePromptSections(currentPrompt: string, candidatePrompt: string) {
  const currentSections = parsePromptSections(currentPrompt);
  const candidateSections = parsePromptSections(candidatePrompt);

  if (!currentSections.length || !candidateSections.length) {
    return normalizeNewlines(candidatePrompt);
  }

  const merged: string[] = [];
  const limit = Math.max(currentSections.length, candidateSections.length);

  for (let index = 0; index < limit; index += 1) {
    const currentBody = currentSections[index]?.body || "";
    const candidateBody = candidateSections[index]?.body || "";

    if (!candidateBody && currentBody) {
      merged.push(currentBody);
      continue;
    }

    if (!currentBody && candidateBody) {
      merged.push(candidateBody);
      continue;
    }

    merged.push(
      normalizeNewlines(currentBody) === normalizeNewlines(candidateBody)
        ? currentBody
        : candidateBody
    );
  }

  return normalizeNewlines(merged.filter(Boolean).join("\n\n"));
}

function previewText(value: string, limit = 400) {
  const normalized = normalizeNewlines(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

async function requestText({
  apiKey,
  provider,
  model,
  system,
  userMessage,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  system: string;
  userMessage: string;
}) {
  return sendChat({
    apiKey,
    provider,
    model,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
}

async function requestStructured<T>({
  apiKey,
  provider,
  model,
  system,
  userMessage,
  fallback,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  system: string;
  userMessage: string;
  fallback: () => T;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestText({
      apiKey,
      provider,
      model,
      system:
        attempt === 0
          ? system
          : `${system}\n\nReturn exactly one JSON object. Do not add prose, markdown, or code fences.`,
      userMessage,
    });

    try {
      return extractJsonObject(raw) as T;
    } catch {}
  }

  return fallback();
}

async function analyzeDiff({
  apiKey,
  provider,
  model,
  currentPrompt,
  originalMessages,
  editedMessages,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  currentPrompt: string;
  originalMessages: FeedbackMessage[];
  editedMessages: FeedbackMessage[];
}) {
  return requestStructured<DiffAnalysis>({
    apiKey,
    provider,
    model,
    system: [
      "You are the Diff Agent in a prompt editing pipeline for teachers.",
      "Compare the original conversation with the teacher-edited conversation and infer what prompt behavior should change.",
      "Return JSON with keys: teacherIntent, keyDifferences, desiredBehaviors, guardrailsToKeep, successCriteria.",
      "Each list should contain short plain-text strings.",
    ].join("\n\n"),
    userMessage: [
      "Current system prompt:",
      currentPrompt,
      "",
      "Original conversation:",
      formatTranscript(originalMessages),
      "",
      "Teacher-edited conversation:",
      formatTranscript(editedMessages),
    ].join("\n"),
    fallback: () => ({
      teacherIntent: "Align the assistant with the edited conversation while preserving the rest of the prompt.",
      keyDifferences: [
        `Original preview: ${previewText(formatTranscript(originalMessages), 200)}`,
        `Edited preview: ${previewText(formatTranscript(editedMessages), 200)}`,
      ],
      desiredBehaviors: ["Match the tone, structure, and content priorities implied by the edited transcript."],
      guardrailsToKeep: ["Keep unrelated behaviors and safety constraints from the current prompt."],
      successCriteria: ["The current testcase response should resemble the teacher-edited assistant message."],
    }),
  });
}

async function locatePromptChanges({
  apiKey,
  provider,
  model,
  currentPrompt,
  diffAnalysis,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  currentPrompt: string;
  diffAnalysis: DiffAnalysis;
}) {
  return requestStructured<PromptPlan>({
    apiKey,
    provider,
    model,
    system: [
      "You are the Prompt Locator Agent in a prompt editing pipeline.",
      "Given the existing prompt and a diff analysis, identify which prompt regions should change and what should stay stable.",
      "Return JSON with keys: targetSections, rewriteInstructions, preserveSections, rationale.",
      "Use short plain-text strings. Refer to high-level prompt areas, not code.",
    ].join("\n\n"),
    userMessage: [
      "Current system prompt:",
      currentPrompt,
      "",
      "Diff analysis JSON:",
      JSON.stringify(diffAnalysis, null, 2),
    ].join("\n"),
    fallback: () => ({
      targetSections: [WHOLE_PROMPT_BLOCK],
      rewriteInstructions: [
        "Update the prompt so the assistant behavior matches the edited conversation.",
        "Preserve the overall learning goals and unrelated instructions.",
      ],
      preserveSections: ["All unrelated sections that are not needed for this behavior change."],
      rationale: "The model should make the smallest prompt change that captures the teacher's requested behavior shift.",
    }),
  });
}

function mergePromptWithFeedback(currentPrompt: string, feedback: string) {
  const cleanFeedback = extractPromptFromText(feedback);
  if (!cleanFeedback) {
    return normalizeNewlines(currentPrompt);
  }

  if (cleanFeedback.length > Math.max(300, currentPrompt.length * 0.6)) {
    return cleanFeedback;
  }

  return normalizeNewlines(
    `${currentPrompt.trim()}\n\nRefinement notes to incorporate:\n${cleanFeedback}`,
  );
}

async function rewritePrompt({
  apiKey,
  provider,
  model,
  currentPrompt,
  diffAnalysis,
  promptPlan,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  currentPrompt: string;
  diffAnalysis: DiffAnalysis;
  promptPlan: PromptPlan;
}) {
  const raw = await requestText({
    apiKey,
    provider,
    model,
    system: [
      "You are the Prompt Rewrite Agent in a teacher prompt editing pipeline.",
      "Rewrite the system prompt so it satisfies the diff analysis and prompt plan.",
      "Return only the full revised prompt in plain text.",
      "Do not use markdown, bullets unless the prompt already needs them, code fences, or commentary.",
      "Preserve unrelated instructions whenever possible.",
    ].join("\n\n"),
    userMessage: [
      "Current system prompt:",
      currentPrompt,
      "",
      "Diff analysis JSON:",
      JSON.stringify(diffAnalysis, null, 2),
      "",
      "Prompt plan JSON:",
      JSON.stringify(promptPlan, null, 2),
    ].join("\n"),
  });

  const candidate = extractPromptFromText(raw);
  if (candidate.length >= Math.max(80, Math.floor(currentPrompt.length * 0.45))) {
    return candidate;
  }

  return mergePromptWithFeedback(currentPrompt, raw);
}

async function generateAssistantReply({
  apiKey,
  provider,
  model,
  prompt,
  studentProfile,
  messages,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  prompt: string;
  studentProfile?: StudentProfile | null;
  messages: { role: "user" | "assistant"; content: string }[];
}) {
  return normalizeNewlines(
    await sendChat({
      apiKey,
      provider,
      model,
      system: buildCaseSpecificPrompt(prompt, studentProfile),
      messages,
    }),
  );
}

async function judgeCase({
  apiKey,
  provider,
  model,
  testCaseId,
  testCaseName,
  conversation,
  expectedAssistant,
  candidateAssistant,
  mode,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  testCaseId: string;
  testCaseName: string;
  conversation: { role: "user" | "assistant"; content: string }[];
  expectedAssistant: string;
  candidateAssistant: string;
  mode: "match-edited" | "regression-check";
}) {
  return requestStructured<VerificationCheck>({
    apiKey,
    provider,
    model,
    system: [
      "You are the Verification Agent in a prompt editing pipeline.",
      mode === "match-edited"
        ? "Judge whether the candidate assistant response matches the teacher-edited target response closely enough for the current testcase."
        : "Judge whether the candidate assistant response preserves the intended behavior of this existing testcase without introducing a regression.",
      "Return JSON with keys: testCaseId, testCaseName, status, score, note, expectedAssistant, candidateAssistant.",
      'status must be one of "pass", "warning", or "fail". score must be an integer from 0 to 100.',
    ].join("\n\n"),
    userMessage: [
      `Test case id: ${testCaseId}`,
      `Test case name: ${testCaseName}`,
      "",
      "Conversation context:",
      formatTranscript(conversation),
      "",
      "Reference assistant response:",
      expectedAssistant,
      "",
      "Candidate assistant response:",
      candidateAssistant,
    ].join("\n"),
    fallback: () => ({
      testCaseId,
      testCaseName,
      status: mode === "match-edited" ? "warning" : "pass",
      score: mode === "match-edited" ? 60 : 75,
      note:
        mode === "match-edited"
          ? "The candidate prompt produced a response, but the verification judge fell back to a conservative estimate."
          : "The candidate prompt produced a response and appears broadly compatible with this testcase.",
      expectedAssistant,
      candidateAssistant,
    }),
  });
}

async function verifyPrompt({
  apiKey,
  provider,
  model,
  candidatePrompt,
  originalMessages,
  editedMessages,
  verificationCases,
  activeCaseId,
  activeCaseName,
  activeCaseStudentProfile,
}: {
  apiKey: string;
  provider: SupportedProvider;
  model: string;
  candidatePrompt: string;
  originalMessages: FeedbackMessage[];
  editedMessages: FeedbackMessage[];
  verificationCases: VerificationCaseInput[];
  activeCaseId: string;
  activeCaseName: string;
  activeCaseStudentProfile?: StudentProfile | null;
}) {
  const currentPrepared = prepareCurrentCase(
    originalMessages,
    editedMessages,
    activeCaseStudentProfile
  );
  let currentCase: VerificationCheck | null = null;

  if (currentPrepared && currentPrepared.expectedAssistant) {
    const candidateAssistant = await generateAssistantReply({
      apiKey,
      provider,
      model,
      prompt: candidatePrompt,
      studentProfile: currentPrepared.studentProfile,
      messages: currentPrepared.conversation,
    });

    currentCase = await judgeCase({
      apiKey,
      provider,
      model,
      testCaseId: activeCaseId,
      testCaseName: activeCaseName,
      conversation: currentPrepared.conversation,
      expectedAssistant: currentPrepared.expectedAssistant,
      candidateAssistant,
      mode: "match-edited",
    });
  }

  const otherCaseChecks: VerificationCheck[] = [];

  for (const testCase of verificationCases) {
    if (!testCase?.id || testCase.id === activeCaseId) {
      continue;
    }

    const prepared = prepareVerificationCase(testCase);
    if (!prepared) {
      continue;
    }

    const candidateAssistant = await generateAssistantReply({
      apiKey,
      provider,
      model,
      prompt: candidatePrompt,
      studentProfile: prepared.studentProfile,
      messages: prepared.conversation,
    });

    const judged = await judgeCase({
      apiKey,
      provider,
      model,
      testCaseId: prepared.testCaseId,
      testCaseName: prepared.testCaseName,
      conversation: prepared.conversation,
      expectedAssistant: prepared.expectedAssistant,
      candidateAssistant,
      mode: "regression-check",
    });

    otherCaseChecks.push(judged);
  }

  const regressions = otherCaseChecks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.testCaseName}: ${check.note}`);
  const warnings = otherCaseChecks
    .filter((check) => check.status === "warning")
    .map((check) => `${check.testCaseName}: ${check.note}`);

  const shouldApply =
    Boolean(currentCase) &&
    currentCase?.status === "pass" &&
    !otherCaseChecks.some((check) => check.status === "fail");

  const summaryParts = [
    currentCase
      ? `Current case ${currentCase.status} (${currentCase.score}/100).`
      : "Current case could not be verified.",
  ];
  if (warnings.length) {
    summaryParts.push(`${warnings.length} other case(s) need review.`);
  }
  if (regressions.length) {
    summaryParts.push(`${regressions.length} regression risk(s) detected.`);
  }
  if (shouldApply) {
    summaryParts.push("Candidate prompt is ready to apply.");
  }

  return {
    currentCase,
    otherCaseChecks,
    regressions: [...regressions, ...warnings],
    summary: summaryParts.join(" "),
    shouldApply,
  } satisfies VerificationResult;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const appId = String(body?.appId || "").trim();
    const currentPrompt = normalizeNewlines(String(body?.currentPrompt || ""));
    const originalMessages: FeedbackMessage[] = Array.isArray(body?.originalMessages)
      ? body.originalMessages
      : [];
    const editedMessages: FeedbackMessage[] = Array.isArray(body?.editedMessages)
      ? body.editedMessages
      : [];
    const verificationCases: VerificationCaseInput[] = Array.isArray(body?.verificationCases)
      ? body.verificationCases
      : [];
    const activeCaseId = String(body?.activeCaseId || "").trim();
    const activeCaseName = String(body?.activeCaseName || "Current case").trim();
    const activeCaseStudentProfile =
      body?.activeCaseStudentProfile && typeof body.activeCaseStudentProfile === "object"
        ? (body.activeCaseStudentProfile as StudentProfile)
        : null;

    if (!appId || !currentPrompt) {
      return NextResponse.json({ error: "Missing appId or currentPrompt." }, { status: 400 });
    }

    if (!originalMessages.length || !editedMessages.length) {
      return NextResponse.json(
        { error: "Both original and edited conversations are required." },
        { status: 400 },
      );
    }

    const hasEdits = editedMessages.some((message, index) => {
      const original = originalMessages[index];
      return (
        message?.role !== original?.role ||
        normalizeNewlines(message?.content || "") !== normalizeNewlines(original?.content || "")
      );
    });

    if (!hasEdits) {
      return NextResponse.json(
        { error: "Edit at least one message before running the prompt update pipeline." },
        { status: 400 },
      );
    }

    const app = await getAppById(appId, userId);
    if (!app) {
      return NextResponse.json({ error: "App not found." }, { status: 404 });
    }

    if (!app.apiKey || !app.provider || !app.model) {
      return NextResponse.json(
        { error: "This app is missing a configured AI provider." },
        { status: 400 },
      );
    }

    const diffAnalysis = await analyzeDiff({
      apiKey: app.apiKey,
      provider: app.provider,
      model: app.model,
      currentPrompt,
      originalMessages,
      editedMessages,
    });

    const promptPlan = await locatePromptChanges({
      apiKey: app.apiKey,
      provider: app.provider,
      model: app.model,
      currentPrompt,
      diffAnalysis,
    });

    const candidatePrompt = await rewritePrompt({
      apiKey: app.apiKey,
      provider: app.provider,
      model: app.model,
      currentPrompt,
      diffAnalysis,
      promptPlan,
    });

    const updatedPrompt = mergePromptSections(currentPrompt, candidatePrompt);
    const changedBlocks = getChangedBlocks(currentPrompt, updatedPrompt);

    const verification = await verifyPrompt({
      apiKey: app.apiKey,
      provider: app.provider,
      model: app.model,
      candidatePrompt: updatedPrompt,
      originalMessages,
      editedMessages,
      verificationCases,
      activeCaseId,
      activeCaseName,
      activeCaseStudentProfile,
    });

    return NextResponse.json({
      diffAnalysis,
      promptPlan,
      candidatePrompt,
      updatedPrompt,
      changedBlocks,
      verification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Prompt update pipeline failed. ${message}` },
      { status: 500 },
    );
  }
}
