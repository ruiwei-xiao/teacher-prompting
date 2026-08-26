"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { flushSync } from "react-dom";
import {
  buildFileAttachmentText,
  CHAT_ATTACHMENT_ACCEPT,
  getSpeechRecognitionConstructor,
  readImageDataUrl,
} from "@/lib/chat-input/client";
import { readStoredPrompt } from "@/lib/prompt-storage/client";
import ChatMessageBody from "@/components/chat/ChatMessageBody";
import {
  buildCaseSpecificPrompt,
  DEFAULT_TEST_CASE_STUDENTS,
  formatStudentProfile,
  TEST_CASE_STUDENTS_SECTION_HEADING,
  type StudentProfile,
} from "@/lib/test-case-students";
import { extractPlottableRhs } from "@/lib/math/function-plot";
import { isAssistedBehaviorEnabled } from "@/lib/assisted-authoring/mode-gate";
import { getWelcomeMessage } from "@/lib/chat/welcome-message";
import { createEditorTestRecording } from "./editor-test-recording";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  originalContent: string;
  imageUrl?: string;
};

type PromptFeedbackChangedBlock = {
  heading: string;
};

type PromptFeedbackEventDetail = {
  updatedPrompt: string;
  changedBlocks: PromptFeedbackChangedBlock[];
  summary: string;
};

type TestCaseVerificationStatus = "idle" | "pass" | "warning" | "fail";

type PromptUpdateVerificationCheck = {
  testCaseId: string;
  testCaseName: string;
  status: Exclude<TestCaseVerificationStatus, "idle">;
  score: number;
  note: string;
  expectedAssistant: string;
  candidateAssistant: string;
};

type PromptUpdateResult = {
  diffAnalysis: {
    teacherIntent: string;
    keyDifferences: string[];
    desiredBehaviors: string[];
    guardrailsToKeep: string[];
    successCriteria: string[];
  };
  promptPlan: {
    targetSections: string[];
    rewriteInstructions: string[];
    preserveSections: string[];
    rationale: string;
  };
  candidatePrompt: string;
  updatedPrompt?: string;
  changedBlocks: PromptFeedbackChangedBlock[];
  verification: {
    currentCase: PromptUpdateVerificationCheck | null;
    otherCaseChecks: PromptUpdateVerificationCheck[];
    regressions: string[];
    summary: string;
    shouldApply: boolean;
  };
};

type TestCaseStatus = {
  totalCount: number;
  passedCount: number;
  allPassed: boolean;
  /** Changes when any testcase chat length changes — editor spotlight remeasure on step 6. */
  chatLayoutKey: string;
};

type BatchRunProgress = {
  title: string;
  detail: string;
};

type TestCaseWarmStart = "scripted" | "teacher";
/** When warmStart is teacher: configure-first opens Edit for student/scenario; scratch starts with greeting only. */
type TeacherEntryMode = "configure" | "scratch";

type TestCaseSet = {
  id: string;
  name: string;
  purposeLabel: string;
  scenarioSummary: string;
  script: TestCasePreset;
  studentProfile: StudentProfile | null;
  messages: ChatMessage[];
  /** Learner lines used for scripted replay / refresh (from model-generated dialogue). */
  simulatedUserTurns?: string[];
  visualizationState: VisualizationState | null;
  passed: boolean;
  verificationStatus: TestCaseVerificationStatus;
  verificationNote: string;
  warmStart: TestCaseWarmStart;
  teacherEntry?: TeacherEntryMode;
  /** After "Simulated student first", set until first save—then case becomes scripted; use Apply to generate preview. */
  autoDialoguePending?: boolean;
};

type TestCaseEditDraft = {
  id: string;
  name: string;
  purposeLabel: string;
  scenarioSummary: string;
  label: string;
  gradeLevel: string;
  knowledgeLevel: string;
  personality: string;
};

function createMessage(
  role: ChatMessage["role"],
  content: string,
  originalContent = content,
  imageUrl?: string,
): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    originalContent,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** Strip leading provider from labels like "openai · gpt-5.4-mini". */
function modelNameWithoutProvider(modelLabel: string): string {
  const sep = " · ";
  if (!modelLabel.includes(sep)) return modelLabel;
  const rest = modelLabel.split(sep).slice(1).join(sep).trim();
  return rest || modelLabel;
}

function messageHasEdits(message: ChatMessage) {
  return message.content !== message.originalContent;
}

function buildStudentProfileForCase(index: number): StudentProfile {
  const base =
    DEFAULT_TEST_CASE_STUDENTS[index] ||
    DEFAULT_TEST_CASE_STUDENTS[index % DEFAULT_TEST_CASE_STUDENTS.length];
  return {
    ...base,
    id: `${base.id}-${index + 1}`,
    label: `Student ${index + 1}`,
  };
}

type TestCasePreset = {
  purposeLabel: string;
  scenarioSummary: string;
  round1User: string;
  round1Assistant: string;
  round2User: string;
  round2Assistant: string;
  round3User: string;
};

const DEFAULT_TEST_CASE_PRESETS: TestCasePreset[] = [
  {
    purposeLabel: "Expected path",
    scenarioSummary:
      "A common learner who should succeed with the intended teaching flow.",
    round1User:
      "I want a simple explanation first, and then I want to try a small example on my own.",
    round1Assistant:
      "Absolutely. I will start small, use plain language, and check your understanding before moving on.",
    round2User:
      "I think I partly get it now. Can you give me one short practice example before making it harder?",
    round2Assistant:
      "Yes. Let's use one small example, walk through it together, and then see what pattern you notice.",
    round3User:
      "Can I explain it back in my own words, and then you tell me what I understood well and what I should fix?",
  },
  {
    purposeLabel: "Edge case",
    scenarioSummary:
      "A student who is frustrated, skeptical, or holding onto a misconception.",
    round1User:
      "I already know the idea, so can you skip the explanation and just tell me the final answer quickly?",
    round1Assistant:
      "I can be concise, but I still want to check one key idea first so we do not build on a misunderstanding.",
    round2User:
      "I think I get it because the rule always works the same way, right? There is basically no exception.",
    round2Assistant:
      "That is a useful guess, but let's test it with a counterexample so we can see where the rule holds and where it needs refinement.",
    round3User:
      "If my idea is partly wrong, can you correct it gently and show exactly which part I should revise?",
  },
];

function buildTestCaseIntroMessage(appName: string, preset?: TestCasePreset) {
  const purposeLabel = preset?.purposeLabel || "Custom case";
  const scenarioSummary =
    preset?.scenarioSummary || "A custom student simulation.";

  if (purposeLabel === "Expected path") {
    return `Hi! I'm ${appName}. Let's learn together step by step. Tell me what you want to understand first, and I'll help you work through it.`;
  }

  if (purposeLabel === "Edge case") {
    return `Hi! I'm ${appName}. If this feels frustrating, that's okay. We can slow it down, focus on one step at a time, and make a plan together.`;
  }

  return `Hi! I'm ${appName}. ${scenarioSummary}`;
}

function getTeacherConfigureFirstMessages(appName: string): ChatMessage[] {
  return [
    createMessage(
      "assistant",
      `Hi! I'm ${appName}. Use **Edit** on this test case card to describe the simulated student and scenario. When you're ready, type or speak below—we won't pre-fill a scripted conversation for you.`,
    ),
  ];
}

function getTeacherScratchStartMessages(
  appName: string,
  preset: TestCasePreset,
): ChatMessage[] {
  return [
    createMessage("assistant", buildTestCaseIntroMessage(appName, preset)),
  ];
}

function getTeacherLedContextSeedMessages(
  appName: string,
  studentProfile: StudentProfile | null,
  preset: TestCasePreset,
  readOnly: boolean,
): ChatMessage[] {
  if (readOnly)
    return getInitialMessages(appName, studentProfile, preset, true);
  const studentLabel = studentProfile?.label || "Student";
  const gradeLevel = studentProfile?.gradeLevel || "middle school";
  const personality = studentProfile?.personality || "thoughtful and curious";
  const knowledgeLevel =
    studentProfile?.knowledgeLevel || "still building core understanding";
  const purposeLabel = preset.purposeLabel || "Custom case";
  const scenarioSummary =
    preset.scenarioSummary || "A custom student simulation.";
  return [
    createMessage(
      "assistant",
      `Hi! I'm ${appName}. This testcase is ${purposeLabel.toLowerCase()}.\n\nStudent: ${studentLabel}\nProfile: ${gradeLevel}; ${knowledgeLevel}; ${personality}\nScenario: ${scenarioSummary}\n\nContinue the conversation below when you're ready.`,
    ),
  ];
}

function createTestCaseSet(
  name: string,
  appName: string,
  readOnly = false,
  studentProfile: StudentProfile | null = null,
  preset?: TestCasePreset,
  options?: {
    warmStart?: TestCaseWarmStart;
    teacherEntry?: TeacherEntryMode;
    autoDialoguePending?: boolean;
  },
): TestCaseSet {
  const warmStart = options?.warmStart ?? "scripted";
  const resolvedPreset = preset || {
    purposeLabel: "Custom case",
    scenarioSummary: "A custom student simulation for this prompt.",
    round1User: "Can you help me get started?",
    round1Assistant: "Absolutely. Let's start with one manageable step.",
    round2User: "I think I partly get it, but I still need support.",
    round2Assistant: "Let's slow it down and test one idea at a time.",
    round3User: "Can I try one final response on my own?",
  };

  let messages: ChatMessage[];
  if (readOnly) {
    messages = getInitialMessages(appName, studentProfile, preset, true);
  } else if (warmStart === "teacher") {
    const entry = options?.teacherEntry ?? "scratch";
    messages =
      entry === "configure"
        ? getTeacherConfigureFirstMessages(appName)
        : getTeacherScratchStartMessages(appName, resolvedPreset);
  } else {
    messages = [];
  }

  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    purposeLabel: resolvedPreset.purposeLabel,
    scenarioSummary: resolvedPreset.scenarioSummary,
    script: resolvedPreset,
    studentProfile,
    messages,
    visualizationState: null,
    passed: false,
    verificationStatus: "idle",
    verificationNote: "",
    warmStart,
    ...(warmStart === "teacher"
      ? { teacherEntry: options?.teacherEntry ?? "scratch" }
      : {}),
    ...(options?.autoDialoguePending ? { autoDialoguePending: true } : {}),
  };
}

function createInitialTestCases(appName: string, readOnly = false) {
  if (readOnly) {
    return [
      createTestCaseSet(
        "Preview",
        appName,
        true,
        buildStudentProfileForCase(0),
        DEFAULT_TEST_CASE_PRESETS[0],
      ),
    ];
  }

  return DEFAULT_TEST_CASE_PRESETS.map((preset, index) => {
    const studentProfile = buildStudentProfileForCase(index);
    return createTestCaseSet(
      studentProfile.label,
      appName,
      false,
      studentProfile,
      preset,
    );
  });
}

const TRY_CHAT_PRESET: TestCasePreset = {
  purposeLabel: "Try your bot",
  scenarioSummary: "Chat as a student to try your Final Prompt.",
  round1User: "Can you help me get started?",
  round1Assistant: "Sure — let's begin.",
  round2User: "I want to try another angle.",
  round2Assistant: "Okay, let's look at it another way.",
  round3User: "Can I check my understanding?",
};

function getTryChatStartMessages(appName: string): ChatMessage[] {
  // Same static welcome as published student chat (not model-generated).
  return [createMessage("assistant", getWelcomeMessage(appName))];
}

/** Single try-chat thread used while Assisted Authoring Mode is OFF. */
function createTryChatCase(appName: string): TestCaseSet {
  const base = createTestCaseSet(
    "Try chat",
    appName,
    false,
    null,
    TRY_CHAT_PRESET,
    {
      warmStart: "teacher",
      teacherEntry: "scratch",
    },
  );
  return {
    ...base,
    messages: getTryChatStartMessages(appName),
  };
}

export type VisualizationState =
  | {
      mode: "code-tracing";
      data: {
        code: string;
        selectedExample: string;
        activeStep: number;
        totalSteps: number;
        currentStatement: string;
        currentState: Record<string, string>;
        output: string[];
        clickedLine: number | null;
        lastInteraction: string;
        recentInteractions: string[];
      };
    }
  | {
      mode: "spacing-testing";
      data: {
        deckTitle: string;
        activeCard: number;
        flipped: boolean;
        studyMoments: string[];
        cards: {
          id: string;
          front: string;
          back: string;
          status: "new" | "hard" | "easy";
        }[];
        lastInteraction: string;
      };
    }
  | {
      mode: "music-staff";
      data: {
        clef: "treble";
        selectedNote: string;
        selectedDuration: "quarter" | "half";
        lastInteraction: string;
        notes: { pitch: string; slot: number; duration: "quarter" | "half" }[];
        melody: string[];
      };
    }
  | {
      mode: "dyslexia-support";
      data: {
        sourceText: string;
        adaptedText: string;
        displayMode: "chunked" | "spaced" | "guided-writing";
        fontMode: "default" | "opendyslexic-style";
        spacingPreset: "standard" | "comfortable" | "maximum";
        lineFocusEnabled: boolean;
        maskEnabled: boolean;
        syllableHighlight: boolean;
        autoReadFocusedChunk: boolean;
        focusChunk: number;
        activeSpokenChunk: number | null;
        activeSpokenSentence: number | null;
        activeSpokenChar: number | null;
        speechRate: number;
        selectedVoice: string;
        speakingTarget: "none" | "focused-chunk" | "full-preview";
        chunkSize: number;
        keywords: string[];
        sentenceFrame: string;
        checklist: string[];
        lastInteraction: string;
      };
    }
  | {
      mode: "virtual-lab";
      data: {
        equation: string;
        title: string;
        effectType: "gas" | "neutralization" | "precipitate" | "general";
        reactants: { label: string; amount: number }[];
        additions: { reagent: string; amount: number }[];
        reactionProgress: number;
        visibleOutcome: string;
        expectedProducts: string[];
      };
    };

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const ASSISTANT_PANEL_DEFAULT_SYSTEM_PROMPT = [
  "You are a helpful teaching assistant.",
  "Follow the teacher's learning goals, stay supportive, and adapt to the learner's level.",
].join("\n");

function resolveAssistantSystemPrompt(args: {
  promptMarkdown: string;
  appId: string;
  serverSystemPrompt: string;
}) {
  const md = args.promptMarkdown.trim();
  if (md) return md;
  if (typeof window !== "undefined") {
    const fromStorage = readStoredPrompt(args.appId).trim();
    if (fromStorage) return fromStorage;
  }
  const server = args.serverSystemPrompt.trim();
  if (server) return server;
  return ASSISTANT_PANEL_DEFAULT_SYSTEM_PROMPT;
}

export function detectVisualizationMode(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("spacing & testing") ||
    normalized.includes("learning principle: spacing & testing") ||
    normalized.includes("retrieval checks") ||
    normalized.includes("flip-style flashcard deck")
  ) {
    return "spacing-testing" as const;
  }

  if (
    normalized.includes("code tracing coach") ||
    normalized.includes("visual trace") ||
    normalized.includes("trace table")
  ) {
    return "code-tracing" as const;
  }

  if (
    normalized.includes("music staff coach") ||
    normalized.includes("five-line staff") ||
    normalized.includes("staff notation")
  ) {
    return "music-staff" as const;
  }

  if (
    normalized.includes("dyslexia-friendly literacy support") ||
    normalized.includes("students with dyslexia") ||
    normalized.includes("dyslexia-friendly version")
  ) {
    return "dyslexia-support" as const;
  }

  if (
    normalized.includes("virtual lab coach") ||
    normalized.includes("visual lab") ||
    normalized.includes("reaction state panel")
  ) {
    return "virtual-lab" as const;
  }

  if (
    normalized.includes("function graph coach") ||
    normalized.includes("function plot preview")
  ) {
    return "function-graph" as const;
  }

  return null;
}

type TraceRuntimeValue = number | string | Array<number | string>;

type TraceSourceLine = {
  indent: number;
  lineNumber: number;
  text: string;
};

type TraceStep = {
  id: string;
  sourceLine: number;
  statement: string;
  explanation: string;
  state: Record<string, string>;
  output: string[];
};

const DEFAULT_TRACE_CODE = `items = [2, 4, 6]
total = 0
for i in range(len(items)):
  total += items[i]
print(total)`;

const TRACE_EXAMPLES: Record<string, string> = {
  "Sum a list": DEFAULT_TRACE_CODE,
  "Track max value": `nums = [3, 5, 7]
best = 0
for i in range(len(nums)):
  best += nums[i]
print(best)`,
  "JavaScript loop": `const scores = [4, 6, 8];
let total = 0;
for (let i = 0; i < scores.length; i++) {
  total += scores[i];
}
console.log(total);`,
};

function formatRuntimeValue(value: TraceRuntimeValue) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => String(item)).join(", ")}]`;
  }

  return String(value);
}

function extractStudentCode(message?: string) {
  if (!message?.trim()) return null;

  const codeFence = message.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (codeFence?.[1]?.trim()) return codeFence[1].trim();

  const looksLikeCode =
    message.includes("\n") ||
    /(for\s+.+range|for\s*\(.+\)|print\(|console\.log|let\s+\w+\s*=|const\s+\w+\s*=)/i.test(
      message,
    );

  return looksLikeCode ? message.trim() : null;
}

function parseArrayLiteral(source: string) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];

  return body.split(",").map((token) => {
    const part = token.trim();
    if (/^-?\d+(\.\d+)?$/.test(part)) {
      return Number(part);
    }

    return part.replace(/^["']|["']$/g, "");
  });
}

function resolveRuntimeValue(
  expression: string,
  state: Record<string, TraceRuntimeValue>,
): TraceRuntimeValue {
  const trimmed = expression.trim().replace(/;$/, "");

  const arrayLiteral = parseArrayLiteral(trimmed);
  if (arrayLiteral) return arrayLiteral;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (/^["'].+["']$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }

  const lenMatch = trimmed.match(/^len\(([\w$]+)\)$/);
  if (lenMatch) {
    const target = state[lenMatch[1]];
    if (Array.isArray(target) || typeof target === "string") {
      return target.length;
    }
  }

  const lengthMatch = trimmed.match(/^([\w$]+)\.length$/);
  if (lengthMatch) {
    const target = state[lengthMatch[1]];
    if (Array.isArray(target) || typeof target === "string") {
      return target.length;
    }
  }

  const indexMatch = trimmed.match(/^([\w$]+)\[(.+)\]$/);
  if (indexMatch) {
    const collection = state[indexMatch[1]];
    const indexValue = resolveRuntimeValue(indexMatch[2], state);
    const index =
      typeof indexValue === "number" ? indexValue : Number(indexValue);

    if (Array.isArray(collection) && Number.isInteger(index)) {
      return collection[index];
    }
  }

  const plusParts = trimmed.split(/\s*\+\s*/);
  if (plusParts.length > 1) {
    const values = plusParts.map((part) => resolveRuntimeValue(part, state));
    if (values.every((value) => typeof value === "number")) {
      return values.reduce((sum, value) => sum + Number(value), 0);
    }

    return values.map((value) => formatRuntimeValue(value)).join("");
  }

  if (trimmed in state) {
    return state[trimmed];
  }

  throw new Error(`Unsupported expression: ${trimmed}`);
}

function createTraceStep(args: {
  sourceLine: number;
  statement: string;
  explanation: string;
  state: Record<string, TraceRuntimeValue>;
  output: string[];
  index: number;
}) {
  return {
    id: `${args.sourceLine}-${args.index}`,
    sourceLine: args.sourceLine,
    statement: args.statement,
    explanation: args.explanation,
    state: Object.fromEntries(
      Object.entries(args.state).map(([key, value]) => [
        key,
        formatRuntimeValue(value),
      ]),
    ),
    output: [...args.output],
  };
}

function collectPythonLoopBody(lines: TraceSourceLine[], startIndex: number) {
  const body: TraceSourceLine[] = [];
  const loopIndent = lines[startIndex].indent;
  let cursor = startIndex + 1;

  while (cursor < lines.length && lines[cursor].indent > loopIndent) {
    body.push(lines[cursor]);
    cursor += 1;
  }

  return { body, nextIndex: cursor - 1 };
}

function collectJavaScriptLoopBody(
  lines: TraceSourceLine[],
  startIndex: number,
) {
  const body: TraceSourceLine[] = [];
  let depth = lines[startIndex].text.includes("{") ? 1 : 0;
  let cursor = startIndex + 1;

  while (cursor < lines.length) {
    const current = lines[cursor];
    const opens = (current.text.match(/\{/g) || []).length;
    const closes = (current.text.match(/\}/g) || []).length;

    if (current.text !== "}") {
      body.push(current);
    }

    depth += opens;
    depth -= closes;

    if (depth <= 0) {
      break;
    }

    cursor += 1;
  }

  return { body, nextIndex: cursor };
}

function runTraceStatement(args: {
  line: TraceSourceLine;
  state: Record<string, TraceRuntimeValue>;
  output: string[];
  steps: TraceStep[];
}) {
  const { line, state, output, steps } = args;
  const assignmentMatch = line.text.match(
    /^(?:let |const |var )?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/,
  );

  if (assignmentMatch) {
    state[assignmentMatch[1]] = resolveRuntimeValue(assignmentMatch[2], state);
    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: `Update ${assignmentMatch[1]} after evaluating the right-hand side.`,
        state,
        output,
        index: steps.length,
      }),
    );
    return;
  }

  const incrementMatch = line.text.match(/^([A-Za-z_$][\w$]*)\s*\+=\s*(.+)$/);
  if (incrementMatch) {
    const currentValue = state[incrementMatch[1]];
    const deltaValue = resolveRuntimeValue(incrementMatch[2], state);

    if (typeof currentValue === "number" && typeof deltaValue === "number") {
      state[incrementMatch[1]] = currentValue + deltaValue;
    } else {
      state[incrementMatch[1]] =
        formatRuntimeValue(currentValue) + formatRuntimeValue(deltaValue);
    }

    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: `Apply the accumulated change to ${incrementMatch[1]}.`,
        state,
        output,
        index: steps.length,
      }),
    );
    return;
  }

  const printMatch = line.text.match(/^(?:print|console\.log)\((.+)\)$/);
  if (printMatch) {
    output.push(formatRuntimeValue(resolveRuntimeValue(printMatch[1], state)));
    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: "Send the current value to output.",
        state,
        output,
        index: steps.length,
      }),
    );
    return;
  }

  if (line.text === "{" || line.text === "}") {
    return;
  }

  throw new Error(`Unsupported tracing statement on line ${line.lineNumber}.`);
}

function buildTraceFromCode(code: string) {
  const lines = code
    .replace(/\r/g, "")
    .split("\n")
    .map((raw, index) => ({
      indent: raw.match(/^\s*/)?.[0].length ?? 0,
      lineNumber: index + 1,
      text: raw.trim().replace(/;$/, ""),
    }))
    .filter(
      (line) =>
        line.text && !line.text.startsWith("#") && !line.text.startsWith("//"),
    );

  if (!lines.length) {
    return {
      steps: [] as TraceStep[],
      error: "Add a short code snippet to trace.",
    };
  }

  const state: Record<string, TraceRuntimeValue> = {};
  const output: string[] = [];
  const steps: TraceStep[] = [];

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const pythonLoop = line.text.match(
        /^for\s+([A-Za-z_$][\w$]*)\s+in\s+range\((.+)\):$/,
      );
      const jsLoop = line.text.match(
        /^for\s*\(\s*(?:let|const|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;\s*\1\s*<\s*(.+?)\s*;\s*\1\+\+\s*\)\s*\{?$/,
      );

      if (pythonLoop || jsLoop) {
        const loopVar = (pythonLoop || jsLoop)?.[1] || "i";
        const startValue = jsLoop ? resolveRuntimeValue(jsLoop[2], state) : 0;
        const endValue = resolveRuntimeValue(
          pythonLoop ? pythonLoop[2] : jsLoop?.[3] || "0",
          state,
        );

        if (typeof startValue !== "number" || typeof endValue !== "number") {
          throw new Error(
            `Loop bounds on line ${line.lineNumber} must resolve to numbers.`,
          );
        }

        const { body, nextIndex } = pythonLoop
          ? collectPythonLoopBody(lines, index)
          : collectJavaScriptLoopBody(lines, index);

        if (!body.length) {
          throw new Error(
            `Add at least one loop body line under line ${line.lineNumber}.`,
          );
        }

        for (let value = startValue; value < endValue; value += 1) {
          state[loopVar] = value;
          steps.push(
            createTraceStep({
              sourceLine: line.lineNumber,
              statement: `${loopVar} = ${value}`,
              explanation: `Start loop iteration ${value + 1}.`,
              state,
              output,
              index: steps.length,
            }),
          );

          body.forEach((bodyLine) =>
            runTraceStatement({
              line: bodyLine,
              state,
              output,
              steps,
            }),
          );
        }

        index = nextIndex;
        continue;
      }

      runTraceStatement({
        line,
        state,
        output,
        steps,
      });
    }

    if (!steps.length) {
      return {
        steps: [] as TraceStep[],
        error: "This snippet did not produce any traceable steps.",
      };
    }

    return { steps };
  } catch (error) {
    return {
      steps: [] as TraceStep[],
      error:
        error instanceof Error
          ? error.message
          : "Could not trace this snippet yet. Try a short loop with variables and print statements.",
    };
  }
}

function TraceVisualization({
  latestUserMessage,
  onStateChange,
}: {
  latestUserMessage?: string;
  onStateChange?: (state: VisualizationState) => void;
}) {
  const latestMessageCode = extractStudentCode(latestUserMessage);
  const initialCode = latestMessageCode || TRACE_EXAMPLES["Sum a list"];
  const initialTrace = buildTraceFromCode(initialCode);
  const [selectedExample, setSelectedExample] = useState("Sum a list");
  const [traceCode, setTraceCode] = useState(initialCode);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>(initialTrace.steps);
  const [traceError, setTraceError] = useState(initialTrace.error || "");
  const [activeStep, setActiveStep] = useState(0);
  const [clickedLine, setClickedLine] = useState<number | null>(null);
  const [lastInteraction, setLastInteraction] = useState("Opened code tracing");
  const [recentInteractions, setRecentInteractions] = useState<string[]>([
    "Opened code tracing",
  ]);

  const currentStep = traceSteps[activeStep];

  function recordInteraction(event: string) {
    setLastInteraction(event);
    setRecentInteractions((current) => [event, ...current].slice(0, 6));
  }

  useEffect(() => {
    onStateChange?.({
      mode: "code-tracing",
      data: {
        code: traceCode,
        selectedExample,
        activeStep,
        totalSteps: traceSteps.length,
        currentStatement: currentStep?.statement || "",
        currentState: currentStep?.state || {},
        output: currentStep?.output || [],
        clickedLine,
        lastInteraction,
        recentInteractions,
      },
    });
  }, [
    activeStep,
    clickedLine,
    currentStep,
    lastInteraction,
    onStateChange,
    recentInteractions,
    selectedExample,
    traceCode,
    traceSteps,
  ]);

  function rebuildTrace(nextCode: string) {
    const result = buildTraceFromCode(nextCode);
    setTraceSteps(result.steps);
    setTraceError(result.error || "");
    setActiveStep(0);
    setClickedLine(null);
  }

  function loadExample(name: string) {
    const nextCode = TRACE_EXAMPLES[name];
    setSelectedExample(name);
    setTraceCode(nextCode);
    rebuildTrace(nextCode);
    recordInteraction(`Selected example: ${name}`);
  }

  function jumpToLine(lineNumber: number) {
    const firstStep = traceSteps.findIndex(
      (step) => step.sourceLine === lineNumber,
    );
    if (firstStep >= 0) {
      setActiveStep(firstStep);
      setClickedLine(lineNumber);
      recordInteraction(`Clicked line ${lineNumber}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
              Interactive code tracing
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Ask the student what code they want to trace, then step through it
              in the interface.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedExample}
              onChange={(event) => loadExample(event.target.value)}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {Object.keys(TRACE_EXAMPLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                rebuildTrace(traceCode);
                recordInteraction("Pressed Build trace");
              }}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Build trace
            </button>
          </div>
        </div>
        {latestMessageCode && (
          <button
            type="button"
            onClick={() => {
              setTraceCode(latestMessageCode);
              rebuildTrace(latestMessageCode);
              recordInteraction("Used latest student message as trace input");
            }}
            className="mt-3 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            Use latest student message as trace input
          </button>
        )}
        <textarea
          value={traceCode}
          onChange={(event) => setTraceCode(event.target.value)}
          className="mt-3 min-h-36 w-full rounded-2xl border border-sky-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-sky-400"
          placeholder="Paste a short Python or JavaScript loop here."
        />
        <div className="mt-2 text-xs text-slate-500">
          Best for small snippets with assignments, `for` loops, indexing, and
          `print` or `console.log`.
        </div>
      </div>

      {traceError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {traceError}
        </div>
      ) : null}

      {traceSteps.length > 0 && currentStep ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Step-through code view
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Click a line to jump to the first event on that line.
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Step {activeStep + 1} / {traceSteps.length}
                </div>
              </div>
              <div className="mt-3 space-y-1 rounded-2xl bg-slate-950 p-3">
                {traceCode.split("\n").map((line, index) => {
                  const lineNumber = index + 1;
                  const highlighted = currentStep.sourceLine === lineNumber;
                  const clickable = traceSteps.some(
                    (step) => step.sourceLine === lineNumber,
                  );

                  return (
                    <button
                      key={`${lineNumber}-${line}`}
                      type="button"
                      onClick={() => jumpToLine(lineNumber)}
                      disabled={!clickable}
                      className={[
                        "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left font-mono text-xs",
                        highlighted
                          ? "bg-sky-500/20 text-sky-100"
                          : "text-slate-300",
                        clickable
                          ? "hover:bg-white/5"
                          : "cursor-default opacity-60",
                      ].join(" ")}
                    >
                      <span className="w-6 shrink-0 text-slate-500">
                        {lineNumber}
                      </span>
                      <span className="whitespace-pre-wrap">{line || " "}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Trace controls
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStep((step) => Math.max(0, step - 1));
                        recordInteraction("Pressed Previous");
                      }}
                      disabled={activeStep === 0}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStep((step) =>
                          Math.min(traceSteps.length - 1, step + 1),
                        );
                        recordInteraction("Pressed Next");
                      }}
                      disabled={activeStep === traceSteps.length - 1}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
                    Current statement
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-800">
                    {currentStep.statement}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {currentStep.explanation}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Runtime state
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Object.entries(currentStep.state).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {key}
                      </div>
                      <div className="mt-1 font-mono text-sm text-slate-800">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Output
                </div>
                <div className="mt-3 rounded-2xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                  {currentStep.output.length
                    ? currentStep.output.join("\n")
                    : "No output yet."}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Execution timeline
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {traceSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStep(index);
                    recordInteraction(`Selected timeline step ${index + 1}`);
                  }}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs",
                    index === activeStep
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {index + 1}. L{step.sourceLine}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const STAFF_NOTE_POSITIONS = [
  { pitch: "A5", lineIndex: -1 },
  { pitch: "G5", lineIndex: -0.5 },
  { pitch: "F5", lineIndex: 0 },
  { pitch: "E5", lineIndex: 0.5 },
  { pitch: "D5", lineIndex: 1 },
  { pitch: "C5", lineIndex: 1.5 },
  { pitch: "B4", lineIndex: 2 },
  { pitch: "A4", lineIndex: 2.5 },
  { pitch: "G4", lineIndex: 3 },
  { pitch: "F4", lineIndex: 3.5 },
  { pitch: "E4", lineIndex: 4 },
  { pitch: "D4", lineIndex: 4.5 },
  { pitch: "C4", lineIndex: 5 },
] as const;

const NOTE_FREQUENCIES: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
};

type StaffDuration = "quarter" | "half";

type PlayableTone = string | { pitch: string; duration?: StaffDuration };

type StaffPlacedNote = {
  pitch: string;
  slot: number;
  duration: StaffDuration;
};

function getStaffPosition(pitch: string) {
  return STAFF_NOTE_POSITIONS.find((note) => note.pitch === pitch) || null;
}

function getDurationSeconds(duration: StaffDuration) {
  return duration === "half" ? 0.92 : 0.46;
}

async function playToneSequence(tones: PlayableTone[]) {
  if (typeof window === "undefined" || !tones.length) return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  if (context.state === "suspended") {
    await context.resume();
  }
  let currentTime = context.currentTime;

  tones.forEach((tone) => {
    const pitch = typeof tone === "string" ? tone : tone.pitch;
    const duration =
      typeof tone === "string" ? "quarter" : tone.duration || "quarter";
    const frequency = NOTE_FREQUENCIES[pitch];
    if (!frequency) return;
    const noteSeconds = getDurationSeconds(duration);

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, currentTime);
    gain.gain.setValueAtTime(0.0001, currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      currentTime + Math.max(0.2, noteSeconds - 0.03),
    );

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(currentTime);
    oscillator.stop(currentTime + noteSeconds);
    currentTime += noteSeconds + 0.05;
  });

  window.setTimeout(
    () => {
      void context.close().catch(() => {
        return;
      });
    },
    Math.ceil(currentTime * 1000) + 120,
  );
}

function MusicStaffVisualization({
  onStateChange,
}: {
  onStateChange?: (state: VisualizationState) => void;
}) {
  const totalSlots = 8;
  const barSize = 4;
  const [selectedPitch, setSelectedPitch] = useState<string>("C5");
  const [selectedDuration, setSelectedDuration] =
    useState<StaffDuration>("quarter");
  const [draggedDuration, setDraggedDuration] = useState<StaffDuration | null>(
    null,
  );
  const [notes, setNotes] = useState<StaffPlacedNote[]>([
    { pitch: "C5", slot: 0, duration: "quarter" },
    { pitch: "D5", slot: 1, duration: "quarter" },
    { pitch: "E5", slot: 2, duration: "half" },
  ]);
  const [lastInteraction, setLastInteraction] = useState(
    "Opened the music staff",
  );
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<{
    slot: number;
    pitch: string;
  } | null>(null);

  function recordInteraction(event: string) {
    setLastInteraction(event);
  }

  function setNoteAtSlot(
    slot: number,
    pitch: string,
    duration: StaffDuration = "quarter",
  ) {
    const nextNote: StaffPlacedNote = { slot, pitch, duration };
    setNotes((current) => {
      const otherNotes = current.filter((note) => note.slot !== slot);
      return [...otherNotes, nextNote].sort((a, b) => a.slot - b.slot);
    });
    setSelectedPitch(pitch);
    setSelectedDuration(duration);
    void playToneSequence([{ pitch, duration: nextNote.duration }]);
    recordInteraction(`Placed ${duration} note ${pitch} in slot ${slot + 1}`);
  }

  function resizeNoteFromDrag(targetSlot: number) {
    if (draggingSlot === null) return;
    const nextDuration: StaffDuration =
      targetSlot > draggingSlot ? "half" : "quarter";

    setNotes((current) =>
      current.map((note) => {
        if (note.slot !== draggingSlot) return note;
        return {
          ...note,
          duration: nextDuration,
        };
      }),
    );

    recordInteraction(
      `Dragged note in slot ${draggingSlot + 1} to ${nextDuration} duration`,
    );
  }

  function clearSlot(slot: number) {
    setNotes((current) => current.filter((note) => note.slot !== slot));
    recordInteraction(`Cleared slot ${slot + 1}`);
  }

  const melody = Array.from({ length: totalSlots }, (_, slot) => {
    const note = notes.find((item) => item.slot === slot);
    return note ? `${note.pitch} (${note.duration})` : "";
  }).filter(Boolean) as string[];

  useEffect(() => {
    onStateChange?.({
      mode: "music-staff",
      data: {
        clef: "treble",
        selectedNote: selectedPitch,
        selectedDuration,
        lastInteraction,
        notes: notes
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((note) => ({
            pitch: note.pitch,
            slot: note.slot,
            duration: note.duration,
          })),
        melody,
      },
    });
  }, [
    draggingSlot,
    lastInteraction,
    melody,
    notes,
    onStateChange,
    selectedDuration,
    selectedPitch,
  ]);

  useEffect(() => {
    if (draggingSlot === null) return;

    const stopDragging = () => setDraggingSlot(null);
    window.addEventListener("mouseup", stopDragging);

    return () => {
      window.removeEventListener("mouseup", stopDragging);
    };
  }, [draggingSlot]);

  function renderPlacedNote(
    pitch: string,
    duration: StaffDuration,
    className = "",
  ) {
    const position = getStaffPosition(pitch);
    const isHalf = duration === "half";
    const stemDown = position ? position.lineIndex <= 2 : false;
    const needsLedger =
      position && Number.isInteger(position.lineIndex)
        ? position.lineIndex < 0 || position.lineIndex > 4
        : false;

    return (
      <>
        {needsLedger && (
          <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 bg-slate-800" />
        )}
        <span
          className={[
            "absolute left-1/2 top-1/2 h-[15px] w-[22px] -translate-x-1/2 -translate-y-1/2 rotate-[-22deg] rounded-[999px] border-[1.7px] border-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.15)]",
            isHalf ? "bg-white" : "bg-slate-900",
            className,
          ].join(" ")}
        />
        <span
          className={[
            "absolute w-[1.6px] bg-slate-950",
            stemDown
              ? "right-[56%] top-1/2 h-10 -translate-y-[8%]"
              : "left-[58%] top-[6%] h-10",
          ].join(" ")}
        />
        {isHalf && (
          <span
            className={[
              "absolute h-[5px] w-[7px] rounded-full bg-white",
              stemDown
                ? "left-[40%] top-[43%] -translate-x-1/2 -translate-y-1/2"
                : "left-[48%] top-1/2 -translate-x-1/2 -translate-y-1/2",
            ].join(" ")}
          />
        )}
      </>
    );
  }

  function renderPaletteNoteGlyph(duration: StaffDuration) {
    const isHalf = duration === "half";
    return (
      <div className="relative h-10 w-10">
        <span
          className={[
            "absolute left-1/2 top-[58%] h-[14px] w-[20px] -translate-x-1/2 -translate-y-1/2 rotate-[-20deg] rounded-full border-[1.7px] border-slate-950",
            isHalf ? "bg-white" : "bg-slate-950",
          ].join(" ")}
        />
        <span className="absolute left-[58%] top-[8%] h-8 w-[1.6px] bg-slate-950" />
      </div>
    );
  }

  const staffTop = 32;
  const lineSpacing = 18;
  const noteAreaLeft = 88;
  const slotWidth = 76;
  const measureGap = 18;
  const noteAreaWidth =
    totalSlots * slotWidth +
    Math.floor((totalSlots - 1) / barSize) * measureGap;
  const noteAreaHeight = 156;
  const totalStaffWidth = noteAreaLeft + noteAreaWidth + 16;

  function getSlotLeft(slot: number) {
    return (
      noteAreaLeft + slot * slotWidth + Math.floor(slot / barSize) * measureGap
    );
  }

  function getSlotCenter(slot: number) {
    return getSlotLeft(slot) + slotWidth / 2;
  }

  function getMeasureBarLeft(boundary: number) {
    if (boundary <= 0) return noteAreaLeft;
    if (boundary >= totalSlots) {
      return getSlotLeft(totalSlots - 1) + slotWidth;
    }

    return getSlotLeft(boundary) - measureGap / 2;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-violet-700">
              Interactive music staff
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Place notes on the five-line staff, then hear the note or full
              melody played back.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void playToneSequence(
                  notes
                    .slice()
                    .sort((a, b) => a.slot - b.slot)
                    .map((note) => ({
                      pitch: note.pitch,
                      duration: note.duration,
                    })),
                );
                recordInteraction("Pressed Play melody");
              }}
              disabled={!notes.length}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Play melody
            </button>
            <button
              type="button"
              onClick={() => {
                setNotes([]);
                recordInteraction("Cleared full melody");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-violet-500/90">
          Place notes directly on the staff. Drag right to lengthen.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Five-line staff
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Write directly on the staff.
            </div>
          </div>
          <div className="text-xs text-slate-400">Treble clef</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="rounded-2xl border border-amber-100 bg-[linear-gradient(to_bottom,#fffefb,#fffaf0)] p-4">
            <div
              className="relative min-w-[720px] rounded-xl bg-white/55"
              style={{
                width: `${totalStaffWidth}px`,
                height: `${noteAreaHeight}px`,
              }}
            >
              <div className="absolute left-2 top-[18px] text-6xl leading-none text-slate-800">
                𝄞
              </div>
              <div className="absolute left-[42px] top-[22px] flex flex-col items-center text-slate-800">
                <span className="text-3xl font-semibold leading-none">4</span>
                <span className="text-3xl font-semibold leading-none">4</span>
              </div>

              {[0, 1, 2, 3, 4].map((line) => (
                <div
                  key={line}
                  className="absolute h-px bg-slate-700"
                  style={{
                    left: `${noteAreaLeft}px`,
                    top: `${staffTop + line * lineSpacing}px`,
                    width: `${noteAreaWidth}px`,
                  }}
                />
              ))}

              {Array.from(
                { length: Math.ceil(totalSlots / barSize) },
                (_, measureIndex) => (
                  <div
                    key={`measure-bg-${measureIndex}`}
                    className="absolute rounded-md bg-slate-100/35"
                    style={{
                      left: `${getSlotLeft(measureIndex * barSize)}px`,
                      top: `${staffTop - 10}px`,
                      width: `${barSize * slotWidth}px`,
                      height: `${lineSpacing * 4 + 20}px`,
                    }}
                  />
                ),
              )}

              {Array.from({ length: totalSlots + 1 }, (_, boundary) => {
                const thick =
                  boundary === 0 ||
                  boundary === totalSlots ||
                  (boundary > 0 && boundary % barSize === 0);

                return (
                  <div
                    key={boundary}
                    className={`absolute bg-slate-700 ${thick ? "w-[2px]" : "w-px"}`}
                    style={{
                      left: `${getMeasureBarLeft(boundary)}px`,
                      top: `${staffTop}px`,
                      height: `${lineSpacing * 4}px`,
                    }}
                  />
                );
              })}

              {hoveredPlacement &&
                !notes.find(
                  (note) =>
                    note.slot === hoveredPlacement.slot &&
                    note.pitch === hoveredPlacement.pitch,
                ) && (
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      left: `${getSlotCenter(hoveredPlacement.slot)}px`,
                      top: `${
                        staffTop +
                        (getStaffPosition(hoveredPlacement.pitch)?.lineIndex ??
                          0) *
                          lineSpacing -
                        1
                      }px`,
                    }}
                  >
                    {renderPlacedNote(
                      hoveredPlacement.pitch,
                      selectedDuration,
                      "opacity-35",
                    )}
                  </div>
                )}

              {STAFF_NOTE_POSITIONS.map((staffNote) =>
                Array.from({ length: totalSlots }, (_, slot) => {
                  const noteAtSlot = notes.find((note) => note.slot === slot);
                  const continuationNote = notes.find(
                    (note) =>
                      note.duration === "half" &&
                      note.slot + 1 === slot &&
                      note.pitch === staffNote.pitch,
                  );
                  const active = noteAtSlot?.pitch === staffNote.pitch;
                  const top = staffTop + staffNote.lineIndex * lineSpacing - 18;

                  return (
                    <button
                      key={`${staffNote.pitch}-${slot}`}
                      type="button"
                      onClick={() => setNoteAtSlot(slot, staffNote.pitch)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const droppedDuration =
                          (event.dataTransfer.getData(
                            "text/plain",
                          ) as StaffDuration) ||
                          draggedDuration ||
                          "quarter";
                        setNoteAtSlot(slot, staffNote.pitch, droppedDuration);
                        setDraggedDuration(null);
                      }}
                      onMouseDown={() => {
                        if (active && noteAtSlot) {
                          setDraggingSlot(noteAtSlot.slot);
                        }
                      }}
                      onMouseEnter={() => {
                        setHoveredPlacement({ slot, pitch: staffNote.pitch });
                        if (draggingSlot !== null) {
                          resizeNoteFromDrag(slot);
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredPlacement((current) =>
                          current?.slot === slot &&
                          current?.pitch === staffNote.pitch
                            ? null
                            : current,
                        );
                      }}
                      onDoubleClick={() => clearSlot(slot)}
                      className="absolute rounded-md transition hover:bg-violet-100/15"
                      style={{
                        left: `${getSlotLeft(slot) + 4}px`,
                        top: `${top}px`,
                        width: `${slotWidth - 8}px`,
                        height: "36px",
                      }}
                      title={`Place ${staffNote.pitch} in slot ${slot + 1}`}
                    >
                      {continuationNote && (
                        <span className="absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-slate-900/75" />
                      )}
                      {active &&
                        renderPlacedNote(
                          staffNote.pitch,
                          noteAtSlot?.duration || "quarter",
                        )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-400">
          Double-click a note to erase it.
        </div>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-violet-700">
          Reading cue
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Last placed pitch:{" "}
          <span className="font-medium">{selectedPitch}</span>
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Drag palette:{" "}
          <span className="font-medium capitalize">
            {selectedDuration} note
          </span>
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Last interaction:{" "}
          <span className="font-medium">{lastInteraction}</span>
        </div>
        <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-3 text-sm text-slate-700">
          Encourage the student to say the note name before pressing play, then
          compare what they predicted with what they heard.
        </div>
      </div>
    </div>
  );
}

type LabEffectType = "gas" | "neutralization" | "precipitate" | "general";

type LabReagent = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  note: string;
};

type LabProfile = {
  equation: string;
  title: string;
  summary: string;
  reagents: LabReagent[];
  apparatus: string[];
  effectType: LabEffectType;
  expectedProducts: string[];
  teacherPrompt: string;
};

function normalizeEquation(equation: string) {
  return equation.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitEquationSides(equation: string) {
  const [leftRaw = "", rightRaw = ""] = equation
    .replace(/=>/g, "->")
    .replace(/=/g, "->")
    .split("->");

  const left = leftRaw
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);
  const right = rightRaw
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);

  return { left, right };
}

function formatChemicalLabel(species: string) {
  const KNOWN_LABELS: Record<string, string> = {
    CH3COOH: "Vinegar (CH3COOH)",
    NaHCO3: "Baking Soda (NaHCO3)",
    HCl: "Hydrochloric Acid (HCl)",
    NaOH: "Sodium Hydroxide (NaOH)",
    AgNO3: "Silver Nitrate (AgNO3)",
    NaCl: "Sodium Chloride (NaCl)",
    AgCl: "Silver Chloride (AgCl)",
    H2O: "Water (H2O)",
    CO2: "Carbon Dioxide (CO2)",
    CH3COONa: "Sodium Acetate (CH3COONa)",
  };

  return KNOWN_LABELS[species] || species;
}

function getReagentNote(effectType: LabEffectType, species: string) {
  if (effectType === "gas") {
    return species.includes("HCO3") || species.includes("CO3")
      ? "Produces gas when combined with an acid."
      : "Supports a visible gas-forming reaction.";
  }

  if (effectType === "neutralization") {
    return species.startsWith("H")
      ? "Acts as the acid reactant in the neutralization."
      : "Acts as the base reactant in the neutralization.";
  }

  if (effectType === "precipitate") {
    return "Combines with another dissolved substance to form a visible solid.";
  }

  return "Auto-generated from the reaction equation.";
}

function inferReactionProfile(equation: string): LabProfile {
  const { left, right } = splitEquationSides(equation);
  const normalized = normalizeEquation(equation);
  const containsAcid = /(hcl|hno3|h2so4|ch3cooh)/.test(normalized);
  const containsBase = /(naoh|koh|nh4oh|nahco3|co3)/.test(normalized);
  const containsCo2 = /(^|[^a-z])co2([^a-z]|$)/.test(normalized);
  const containsPrecipitateProduct = /(agcl|baso4|caco3|pbi2)/.test(normalized);

  let effectType: LabEffectType = "general";
  if (containsCo2 || /(hco3|co3)/.test(normalized)) {
    effectType = "gas";
  } else if (containsPrecipitateProduct) {
    effectType = "precipitate";
  } else if (containsAcid && containsBase) {
    effectType = "neutralization";
  }

  const colorPalette = ["#bfdbfe", "#fde68a", "#d1fae5", "#fecaca", "#c4b5fd"];
  const reagents = left.map((species, index) => ({
    id: `equation-${index}`,
    label: formatChemicalLabel(species),
    shortLabel: species.replace(/\s+/g, ""),
    color: colorPalette[index % colorPalette.length],
    note: getReagentNote(effectType, species),
  }));

  const expectedProducts = right.length
    ? right.map((species) => formatChemicalLabel(species))
    : ["Observe the generated reaction products"];

  if (effectType === "gas") {
    return {
      equation,
      title: "Gas-forming reaction lab",
      summary: "This equation suggests a reaction that releases a visible gas.",
      reagents,
      apparatus: ["Beaker", "Dropper", "Gas bubbles view"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student which reactants must collide to make the bubbles appear and what evidence shows gas production.",
    };
  }

  if (effectType === "neutralization") {
    return {
      equation,
      title: "Neutralization lab",
      summary:
        "This equation suggests an acid-base reaction that trends toward neutral products.",
      reagents,
      apparatus: ["Beaker", "Thermometer", "Indicator color panel"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student how they would tell when the acid and base amounts are closest to balanced.",
    };
  }

  if (effectType === "precipitate") {
    return {
      equation,
      title: "Precipitation lab",
      summary:
        "This equation suggests a visible solid forms from dissolved reactants.",
      reagents,
      apparatus: ["Beaker", "Dropper", "Precipitate view panel"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student why a solid can appear even if both starting solutions look clear.",
    };
  }

  return {
    equation,
    title: "Equation-driven virtual lab",
    summary:
      "This lab was generated from the reaction equation with a general reaction scaffold.",
    reagents,
    apparatus: ["Beaker", "Dropper", "Observation panel"],
    effectType,
    expectedProducts,
    teacherPrompt:
      "Ask the student what visible evidence they would expect if this reaction is really happening.",
  };
}

function VirtualLabVisualization({
  onStateChange,
}: {
  onStateChange?: (state: VisualizationState) => void;
}) {
  const REACTION_PRESETS = [
    {
      equation: "CH3COOH + NaHCO3 -> CO2 + H2O + CH3COONa",
      title: "Acid-base gas formation",
      summary:
        "Vinegar reacts with baking soda and releases carbon dioxide bubbles.",
      reagents: [
        {
          id: "ch3cooh",
          label: "Vinegar (CH3COOH)",
          shortLabel: "Acid",
          color: "#fde68a",
          note: "Weak acid used in a classic fizzing reaction.",
        },
        {
          id: "nahco3",
          label: "Baking Soda (NaHCO3)",
          shortLabel: "Base",
          color: "#e5e7eb",
          note: "Mild base that produces gas when mixed with vinegar.",
        },
        {
          id: "indicator",
          label: "Indicator",
          shortLabel: "pH",
          color: "#c4b5fd",
          note: "Optional color cue for noticing acidity changes.",
        },
      ],
      apparatus: ["Beaker", "Measuring dropper", "Gas bubbles view"],
      effectType: "gas" as const,
      expectedProducts: ["CO2 gas", "Water", "Sodium acetate solution"],
      teacherPrompt:
        "Ask the student which reactant is limiting and whether adding more acid or more base would make the fizz last longer.",
    },
    {
      equation: "HCl + NaOH -> NaCl + H2O",
      title: "Neutralization",
      summary:
        "An acid and a base react to make salt and water, with a small temperature rise.",
      reagents: [
        {
          id: "hcl",
          label: "Hydrochloric Acid (HCl)",
          shortLabel: "Acid",
          color: "#fecaca",
          note: "Virtual dilute acid used for a safe neutralization simulation.",
        },
        {
          id: "naoh",
          label: "Sodium Hydroxide (NaOH)",
          shortLabel: "Base",
          color: "#bfdbfe",
          note: "Virtual dilute base used for a safe neutralization simulation.",
        },
        {
          id: "indicator",
          label: "Indicator",
          shortLabel: "pH",
          color: "#c4b5fd",
          note: "Shows whether the mixture is acidic, basic, or neutral.",
        },
      ],
      apparatus: ["Beaker", "Thermometer", "Indicator color panel"],
      effectType: "neutralization" as const,
      expectedProducts: ["Salt solution", "Water"],
      teacherPrompt:
        "Ask the student when the indicator should look most neutral and why matching amounts matters.",
    },
    {
      equation: "AgNO3 + NaCl -> AgCl + NaNO3",
      title: "Precipitation reaction",
      summary: "Two clear solutions react to form a cloudy white precipitate.",
      reagents: [
        {
          id: "agno3",
          label: "Silver Nitrate (AgNO3)",
          shortLabel: "AgNO3",
          color: "#e0f2fe",
          note: "Virtual solution used to form a visible precipitate.",
        },
        {
          id: "nacl",
          label: "Sodium Chloride (NaCl)",
          shortLabel: "NaCl",
          color: "#d1fae5",
          note: "Virtual salt solution that forms solid silver chloride.",
        },
        {
          id: "water",
          label: "Water",
          shortLabel: "H2O",
          color: "#bfdbfe",
          note: "Can dilute the mixture and reduce cloudiness.",
        },
      ],
      apparatus: ["Beaker", "Dropper", "Precipitate view panel"],
      effectType: "precipitate" as const,
      expectedProducts: ["Silver chloride solid", "Sodium nitrate solution"],
      teacherPrompt:
        "Ask the student why a solid appears even though both starting solutions were clear.",
    },
  ] as const;

  function getReactionPreset(equation: string) {
    const normalized = normalizeEquation(equation);
    return (
      REACTION_PRESETS.find(
        (preset) => normalizeEquation(preset.equation) === normalized,
      ) || null
    );
  }

  const defaultEquation = REACTION_PRESETS[0].equation;
  const amountOptions = [5, 10, 20];
  const [reactionInput, setReactionInput] = useState<string>(defaultEquation);
  const [activeEquation, setActiveEquation] = useState<string>(defaultEquation);
  const [heatLevel, setHeatLevel] = useState(10);

  const activePreset = getReactionPreset(activeEquation);
  const activeProfile = activePreset || inferReactionProfile(activeEquation);
  const generatedReagents = activeProfile.reagents;
  const selectedDefaultReagent = generatedReagents[0]?.id || "generic-0";
  const [selectedReagent, setSelectedReagent] = useState(
    selectedDefaultReagent,
  );
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [additions, setAdditions] = useState<
    Array<{ reagentId: string; amount: number }>
  >([]);

  useEffect(() => {
    setSelectedReagent(generatedReagents[0]?.id || "generic-0");
    setAdditions([]);
  }, [activeEquation]);

  const reagentMap = Object.fromEntries(
    generatedReagents.map((reagent) => [reagent.id, reagent]),
  ) as Record<string, LabReagent>;

  const totals = additions.reduce<Record<string, number>>((acc, addition) => {
    acc[addition.reagentId] = (acc[addition.reagentId] || 0) + addition.amount;
    return acc;
  }, {});

  const totalVolume = additions.reduce(
    (sum, addition) => sum + addition.amount,
    0,
  );
  const reactantAmounts = generatedReagents.map(
    (reagent) => totals[reagent.id] || 0,
  );
  const matchedVolume =
    reactantAmounts.length > 1
      ? Math.min(...reactantAmounts.filter((amount) => amount > 0))
      : 0;
  const reactionProgress = Math.min(100, matchedVolume * 5 + heatLevel * 0.15);

  const isGasReaction = activeProfile.effectType === "gas";
  const isNeutralization = activeProfile.effectType === "neutralization";
  const isPrecipitate = activeProfile.effectType === "precipitate";

  const gasStrength = isGasReaction ? Math.min(100, reactionProgress + 10) : 0;
  const precipitateStrength = isPrecipitate
    ? Math.min(100, reactionProgress + 8)
    : 0;
  const colorShift = isNeutralization ? Math.min(100, reactionProgress) : 0;
  const temperature = Math.round(
    21 +
      heatLevel * 0.12 +
      (isNeutralization ? reactionProgress * 0.08 : 0) +
      (isGasReaction ? reactionProgress * 0.03 : 0),
  );

  let liquidColor = "#dbeafe";
  let visibleOutcome = "No strong visible change yet.";

  if (isGasReaction && gasStrength > 0) {
    liquidColor = "#fde68a";
    visibleOutcome = "Fizzing bubbles appear as carbon dioxide gas forms.";
  } else if (isNeutralization && colorShift > 0) {
    liquidColor =
      reactantAmounts[0] > reactantAmounts[1]
        ? "#f9a8d4"
        : reactantAmounts[1] > reactantAmounts[0]
          ? "#86efac"
          : "#c4b5fd";
    visibleOutcome =
      reactantAmounts[0] === reactantAmounts[1]
        ? "The indicator moves toward a neutral color."
        : "The indicator shows whether acid or base is still left over.";
  } else if (isPrecipitate && precipitateStrength > 0) {
    liquidColor = "#e2e8f0";
    visibleOutcome =
      "The solution becomes cloudy as a white precipitate forms.";
  } else if (generatedReagents.length > 0) {
    liquidColor = generatedReagents[0].color;
    visibleOutcome =
      "The generated lab is ready. Add the listed reactants to test the equation.";
  }

  const beakerFillHeight = Math.max(22, Math.min(84, 24 + totalVolume * 1.4));
  const bubbleCount = Math.max(0, Math.round(gasStrength / 11));
  const cloudOpacity = Math.max(0.08, precipitateStrength / 100);
  const neutralizationLevel =
    reactantAmounts.length >= 2 &&
    reactantAmounts[0] === reactantAmounts[1] &&
    reactantAmounts[0] > 0
      ? "Balanced"
      : reactantAmounts.length >= 2 && reactantAmounts[0] > reactantAmounts[1]
        ? "Acid excess"
        : reactantAmounts.length >= 2 && reactantAmounts[1] > reactantAmounts[0]
          ? "Base excess"
          : "Not enough data";

  const stateLabel = isGasReaction
    ? gasStrength < 20
      ? "Low bubbling"
      : gasStrength < 55
        ? "Moderate bubbling"
        : "High bubbling"
    : isPrecipitate
      ? precipitateStrength < 20
        ? "Slight cloudiness"
        : precipitateStrength < 55
          ? "Visible precipitate"
          : "Heavy precipitate"
      : neutralizationLevel;

  const latestActions = additions.slice(-5).reverse();
  const chartHeights = [0.25, 0.46, 0.68, 0.84, 0.58].map((factor) =>
    Math.max(
      8,
      Math.min(94, Math.round(factor * Math.max(reactionProgress, 15))),
    ),
  );
  const generatedTitle = activeProfile.title;
  const generatedSummary = activeProfile.summary;
  const teacherPrompt = activeProfile.teacherPrompt;

  useEffect(() => {
    onStateChange?.({
      mode: "virtual-lab",
      data: {
        equation: activeEquation,
        title: generatedTitle,
        effectType: activeProfile.effectType,
        reactants: generatedReagents.map((reagent) => ({
          label: reagent.label,
          amount: totals[reagent.id] || 0,
        })),
        additions: additions.map((addition) => ({
          reagent: reagentMap[addition.reagentId]?.label || addition.reagentId,
          amount: addition.amount,
        })),
        reactionProgress,
        visibleOutcome,
        expectedProducts: [...activeProfile.expectedProducts],
      },
    });
  }, [
    activeEquation,
    activeProfile.effectType,
    activeProfile.expectedProducts,
    additions,
    generatedReagents,
    generatedTitle,
    onStateChange,
    reactionProgress,
    reagentMap,
    totals,
    visibleOutcome,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Reaction-based virtual lab
        </div>
        <div className="mt-1 text-sm text-slate-700">
          Given a chemical reaction equation, this panel generates the reagents,
          apparatus, and visible lab effects for the experiment.
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {REACTION_PRESETS.map((preset) => (
            <button
              key={preset.equation}
              type="button"
              onClick={() => {
                setReactionInput(preset.equation);
                setActiveEquation(preset.equation);
              }}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                activeEquation === preset.equation
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-emerald-200 bg-white text-slate-700 hover:bg-emerald-100",
              ].join(" ")}
            >
              {preset.equation}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Reaction equation
            </div>
            <textarea
              value={reactionInput}
              onChange={(event) => setReactionInput(event.target.value)}
              className="mt-3 min-h-24 w-full rounded-2xl border border-emerald-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-emerald-400"
              placeholder="Enter a chemical reaction equation"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveEquation(reactionInput.trim() || defaultEquation)
                }
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Generate virtual lab
              </button>
              <button
                type="button"
                onClick={() => {
                  setReactionInput(defaultEquation);
                  setActiveEquation(defaultEquation);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reset equation
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2 rounded-2xl border border-emerald-200 bg-white p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Heat level
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={heatLevel}
                onChange={(event) => setHeatLevel(Number(event.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="text-xs text-slate-600">{heatLevel}% applied</div>
            </label>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated lab
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                {generatedTitle}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {generatedSummary}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated reagents
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Select one required reactant, choose an amount, then add it to
                the lab.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {amountOptions.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setSelectedAmount(amount)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    selectedAmount === amount
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-200 bg-white text-slate-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {amount} mL
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {generatedReagents.map((reagent) => (
              <button
                key={reagent.id}
                type="button"
                onClick={() => setSelectedReagent(reagent.id)}
                className={[
                  "rounded-2xl border p-3 text-left transition",
                  selectedReagent === reagent.id
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/60",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {reagent.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {reagent.shortLabel}
                    </div>
                  </div>
                  <div
                    className="h-8 w-8 rounded-full border border-slate-200"
                    style={{ backgroundColor: reagent.color }}
                  />
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  {reagent.note}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setAdditions((current) => [
                  ...current,
                  { reagentId: selectedReagent, amount: selectedAmount },
                ])
              }
              disabled={!generatedReagents.length}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add {selectedAmount} mL of{" "}
              {reagentMap[selectedReagent]?.label || "reactant"}
            </button>
            <button
              type="button"
              onClick={() => setAdditions((current) => current.slice(0, -1))}
              disabled={!additions.length}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo last
            </button>
            <button
              type="button"
              onClick={() => setAdditions([])}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Clear beaker
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Generated apparatus
          </div>
          <div className="mt-4 flex items-end justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-24 w-16 overflow-hidden rounded-b-3xl border-2 border-slate-400 bg-slate-50">
                <div
                  className="absolute inset-x-0 bottom-0 transition-all"
                  style={{
                    height: `${Math.max(22, Math.min(84, beakerFillHeight))}%`,
                    backgroundColor: liquidColor,
                  }}
                />
                <div className="absolute inset-x-2 bottom-2 top-2">
                  {Array.from({ length: bubbleCount }).map((_, index) => (
                    <div
                      key={index}
                      className="absolute rounded-full border border-white/70 bg-white/50"
                      style={{
                        left: `${(index * 17) % 72}%`,
                        bottom: `${(index * 13) % 70}%`,
                        height: `${9 + (index % 3) * 4}px`,
                        width: `${9 + (index % 3) * 4}px`,
                      }}
                    />
                  ))}
                </div>
                {isPrecipitate && (
                  <div
                    className="absolute inset-x-1 bottom-1 rounded-b-2xl bg-white transition-opacity"
                    style={{
                      height: `${Math.max(6, Math.min(26, precipitateStrength / 4))}%`,
                      opacity: cloudOpacity,
                    }}
                  />
                )}
              </div>
              <span className="text-[11px] text-slate-600">Beaker</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative h-20 w-4 rounded-full bg-slate-300">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full bg-rose-400"
                  style={{
                    height: `${Math.max(15, Math.min(90, temperature - 8))}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-slate-600">Thermometer</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-100">
                <div
                  className={[
                    "h-8 w-8 rounded-full transition-opacity",
                    isPrecipitate
                      ? "bg-slate-200"
                      : "bg-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.65)]",
                  ].join(" ")}
                  style={{
                    opacity: isPrecipitate
                      ? cloudOpacity
                      : Math.max(0.16, reactionProgress / 100),
                  }}
                />
              </div>
              <span className="text-[11px] text-slate-600">
                {isPrecipitate ? "Cloudiness" : "Energy cue"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Equation
              </div>
              <div className="mt-2 break-words font-mono text-xs text-slate-700">
                {activeEquation}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Apparatus list
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {activeProfile.apparatus.join(", ")}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Student action log
            </div>
            <div className="mt-2 space-y-2">
              {latestActions.length ? (
                latestActions.map((addition, index) => (
                  <div
                    key={`${addition.reagentId}-${addition.amount}-${index}`}
                    className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span>
                      {reagentMap[addition.reagentId]?.label ||
                        addition.reagentId}
                    </span>
                    <span className="font-medium">{addition.amount} mL</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">
                  No reactants added yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Reaction state panel
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Temperature</span>
              <span className="font-medium">{temperature}°C</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reaction progress</span>
              <span className="font-medium">{reactionProgress}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Visible state</span>
              <span className="font-medium">{stateLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Products</span>
              <span className="font-medium">
                {activeProfile.expectedProducts.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total added</span>
              <span className="font-medium">{totalVolume} mL</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              What the student sees
            </div>
            <div className="mt-2 text-sm text-slate-700">{visibleOutcome}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Teacher cue
            </div>
            <div className="mt-2 text-sm text-slate-700">{teacherPrompt}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Reactant totals
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
              {generatedReagents.map((reagent) => (
                <div
                  key={reagent.id}
                  className="rounded-xl bg-emerald-50 px-3 py-2"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {reagent.shortLabel}
                  </div>
                  <div className="mt-1 font-medium">
                    {totals[reagent.id] || 0} mL
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Reaction timeline
        </div>
        <div className="mt-4 flex h-32 items-end gap-3">
          {chartHeights.map((height, index) => (
            <div
              key={`${height}-${index}`}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div
                className="w-full rounded-t-lg bg-emerald-400"
                style={{ height: `${height}%` }}
              />
              <span className="text-[11px] text-slate-500">s{index + 1}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-slate-600">
          The timeline summarizes how strongly the generated reaction is showing
          visible evidence as the student adds reactants.
        </div>
      </div>
    </div>
  );
}

const DEFAULT_DYSLEXIA_TEXT = `Read the paragraph and then write three sentences explaining the main idea. Use details from the text to support your answer.

Plants need sunlight, water, and air to grow. When a plant does not get enough sunlight, it may become weak and stop growing well.`;

function splitIntoReadingChunks(text: string, chunkSize: number) {
  const normalized = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

function extractReadingKeywords(text: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "that",
    "with",
    "from",
    "your",
    "then",
    "into",
    "this",
    "have",
    "will",
    "they",
    "them",
    "does",
    "need",
    "when",
    "what",
    "well",
    "write",
    "read",
    "three",
    "using",
    "about",
  ]);

  const counts = new Map<string, number>();
  text
    .toLowerCase()
    .match(/[a-z]{4,}/g)
    ?.forEach((word) => {
      if (stopWords.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function buildAdaptedReadingText(
  sourceText: string,
  displayMode: "chunked" | "spaced" | "guided-writing",
  chunkSize: number,
) {
  const chunks = splitIntoReadingChunks(sourceText, chunkSize);
  if (!chunks.length) return "";

  if (displayMode === "spaced") {
    return chunks.join("\n\n").replace(/([A-Za-z])/g, "$1 ");
  }

  if (displayMode === "guided-writing") {
    return [
      "Read one short part at a time.",
      ...chunks.map((chunk, index) => `Part ${index + 1}: ${chunk}`),
      "",
      "Now write using this frame:",
      "The main idea is ____. One detail is ____. Another detail is ____.",
    ].join("\n");
  }

  return chunks
    .map((chunk, index) => `Part ${index + 1}: ${chunk}`)
    .join("\n\n");
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenizeSpeechText(text: string) {
  const tokens: Array<{
    text: string;
    start: number;
    end: number;
    isWord: boolean;
  }> = [];
  const pattern = /([A-Za-z']+|\s+|[^A-Za-z'\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const token = match[0];
    tokens.push({
      text: token,
      start: match.index,
      end: match.index + token.length,
      isWord: /[A-Za-z]/.test(token),
    });
  }

  return tokens;
}

function splitWordIntoSyllableLikeParts(word: string) {
  const matches = word.match(
    /[^aeiouyAEIOUY]*[aeiouyAEIOUY]+(?:[^aeiouyAEIOUY](?=[^aeiouyAEIOUY]*[aeiouyAEIOUY]))?[^aeiouyAEIOUY]*/g,
  );
  return matches?.filter(Boolean) ?? [word];
}

function renderSyllableText(text: string, enabled: boolean) {
  if (!enabled) return text;

  const tokens = text.match(/([A-Za-z']+|\s+|[^A-Za-z'\s]+)/g) || [text];
  let syllableIndex = 0;

  return tokens.map((token, tokenIndex) => {
    if (!/[A-Za-z]/.test(token)) {
      return <span key={`token-${tokenIndex}`}>{token}</span>;
    }

    const parts = splitWordIntoSyllableLikeParts(token);
    return (
      <span key={`word-${tokenIndex}`}>
        {parts.map((part, partIndex) => {
          const activeColor =
            syllableIndex % 2 === 0
              ? "bg-amber-100 text-amber-900"
              : "bg-sky-100 text-sky-900";
          syllableIndex += 1;
          return (
            <span
              key={`part-${tokenIndex}-${partIndex}`}
              className={`rounded px-0.5 ${activeColor}`}
            >
              {part}
            </span>
          );
        })}
      </span>
    );
  });
}

function renderSpeechAwareSentence(
  text: string,
  activeChar: number | null,
  syllableHighlight: boolean,
) {
  if (activeChar == null) {
    return renderSyllableText(text, syllableHighlight);
  }

  const tokens = tokenizeSpeechText(text);

  return tokens.map((token, tokenIndex) => {
    if (!token.isWord) {
      return <span key={`speech-token-${tokenIndex}`}>{token.text}</span>;
    }

    const isActiveWord = activeChar >= token.start && activeChar < token.end;

    return (
      <span
        key={`speech-word-${tokenIndex}`}
        data-reading-active-word={isActiveWord ? "true" : undefined}
        className={[
          "relative inline-block rounded-xl px-0.5 pb-1 pt-0.5 transition-all duration-200",
          isActiveWord ? "bg-sky-50/90 shadow-sm" : "bg-transparent",
        ].join(" ")}
      >
        {Array.from(token.text).map((char, charIndex) => {
          const globalCharIndex = token.start + charIndex;
          const isCurrentChar = activeChar === globalCharIndex;
          const isPastChar = activeChar > globalCharIndex;

          return (
            <span
              key={`speech-char-${tokenIndex}-${charIndex}`}
              className={[
                "relative z-10 rounded-md transition-all duration-100",
                isCurrentChar
                  ? "bg-sky-600/90 px-0.5 py-0.5 text-white shadow-sm"
                  : isActiveWord
                    ? "text-slate-900"
                    : isPastChar
                      ? "text-slate-700"
                      : "text-slate-800",
              ].join(" ")}
            >
              {char}
            </span>
          );
        })}
      </span>
    );
  });
}

function getFlashcardSourceText(message?: string) {
  if (!message?.trim()) return "";
  return message.split("[Uploaded file:")[0]?.trim() || message.trim();
}

type FlashcardStatus = "new" | "hard" | "easy";

type Flashcard = {
  id: string;
  front: string;
  back: string;
  status: FlashcardStatus;
};

function buildSpacingTestingCards(message?: string): Flashcard[] {
  const source = getFlashcardSourceText(message);
  const fallbackCards: Flashcard[] = [
    {
      id: "card-0",
      front: "hola",
      back: "hello; try saying: Hola, Ana.",
      status: "new",
    },
    {
      id: "card-1",
      front: "gracias",
      back: "thank you; try saying: Gracias por tu ayuda.",
      status: "new",
    },
    {
      id: "card-2",
      front: "adios",
      back: "goodbye; try saying: Adios, nos vemos manana.",
      status: "new",
    },
    {
      id: "card-3",
      front: "bonjour",
      back: "hello / good morning; try saying: Bonjour, Madame.",
      status: "new",
    },
    {
      id: "card-4",
      front: "merci",
      back: "thank you; try saying: Merci beaucoup.",
      status: "new",
    },
  ];

  if (!source) return fallbackCards;

  const candidateLines = source
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const pairs = candidateLines
    .map((line) => {
      const match = line.match(/^(.+?)\s*(?:-|:|=|->|=>)\s*(.+)$/);
      if (!match) return null;
      return {
        front: match[1].trim(),
        back: match[2].trim(),
      };
    })
    .filter((entry): entry is { front: string; back: string } =>
      Boolean(entry),
    );

  if (pairs.length) {
    return pairs.slice(0, 8).map((pair, index) => ({
      id: `card-${index}`,
      front: pair.front,
      back: `${pair.back}; use it in a short sentence.`,
      status: "new",
    }));
  }

  const words = source
    .split(/[\n,]/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (words.length) {
    return words.map((word, index) => ({
      id: `card-${index}`,
      front: word,
      back: `Recall the meaning of "${word}", then say it in a short sentence.`,
      status: "new",
    }));
  }

  return fallbackCards;
}

function getNextFlashcardIndex(cards: Flashcard[], activeCard: number) {
  if (!cards.length) return 0;

  const statusWeight: Record<FlashcardStatus, number> = {
    hard: 0,
    new: 1,
    easy: 2,
  };

  const rotatedIndices = cards.map(
    (_, offset) => (activeCard + offset + 1) % cards.length,
  );

  return rotatedIndices.sort((left, right) => {
    const leftWeight = statusWeight[cards[left].status];
    const rightWeight = statusWeight[cards[right].status];
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left - right;
  })[0];
}

function SpacingTestingVisualization({
  latestUserMessage,
  assistantTurnCount,
  embedded = false,
  onStateChange,
}: {
  latestUserMessage?: string;
  assistantTurnCount?: number;
  embedded?: boolean;
  onStateChange?: (state: VisualizationState) => void;
}) {
  const baseCards = useMemo(
    () => buildSpacingTestingCards(latestUserMessage),
    [latestUserMessage],
  );
  const [cards, setCards] = useState<Flashcard[]>(baseCards);
  const [activeCard, setActiveCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [lastInteraction, setLastInteraction] = useState(
    "Opened vocabulary flashcards",
  );
  const studyMoments = [
    "Now",
    "1 chat later",
    "Later today",
    "Tomorrow",
    "This week",
  ];
  const previousAssistantTurnRef = useRef(assistantTurnCount ?? 0);

  useEffect(() => {
    setCards(baseCards);
    setActiveCard(0);
    setFlipped(false);
    setLastInteraction("Loaded a new vocabulary deck");
  }, [baseCards]);

  const currentCard =
    cards[Math.min(activeCard, Math.max(cards.length - 1, 0))];

  useEffect(() => {
    if (!onStateChange || !currentCard) return;
    onStateChange({
      mode: "spacing-testing",
      data: {
        deckTitle: "Spacing & Testing flashcards",
        activeCard,
        flipped,
        studyMoments,
        cards,
        lastInteraction,
      },
    });
  }, [activeCard, cards, currentCard, flipped, lastInteraction, onStateChange]);

  useEffect(() => {
    if (!assistantTurnCount || assistantTurnCount <= 1 || !cards.length) return;
    if (assistantTurnCount === previousAssistantTurnRef.current) return;

    previousAssistantTurnRef.current = assistantTurnCount;

    if (!flipped) {
      setFlipped(true);
      setLastInteraction(
        `Chatbot flipped card ${activeCard + 1} to reveal the answer`,
      );
      return;
    }

    const nextCard = getNextFlashcardIndex(cards, activeCard);
    setActiveCard(nextCard);
    setFlipped(false);
    setLastInteraction(`Chatbot moved to spaced review card ${nextCard + 1}`);
  }, [activeCard, assistantTurnCount, cards, flipped]);

  function markCard(status: Extract<FlashcardStatus, "hard" | "easy">) {
    setCards((current) =>
      current.map((card, index) =>
        index === activeCard ? { ...card, status } : card,
      ),
    );
    setLastInteraction(`Marked card ${activeCard + 1} as ${status}`);
  }

  function goToCard(nextIndex: number) {
    const clamped = Math.max(0, Math.min(cards.length - 1, nextIndex));
    setActiveCard(clamped);
    setFlipped(false);
    setLastInteraction(`Moved to card ${clamped + 1}`);
  }

  if (!currentCard) return null;

  const easyCount = cards.filter((card) => card.status === "easy").length;
  const hardCount = cards.filter((card) => card.status === "hard").length;

  if (embedded) {
    return (
      <div className="max-w-[85%] rounded-[1.5rem] border-2 border-violet-200 bg-white/95 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-violet-500">
            Flashcard
          </div>
          <div className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700">
            {activeCard + 1} / {cards.length}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFlipped((current) => !current);
            setLastInteraction(
              flipped
                ? `Turned card ${activeCard + 1} back to question`
                : `Flipped card ${activeCard + 1} to answer`,
            );
          }}
          className="block w-full rounded-[1.25rem] text-left"
          style={{ perspective: "1200px" }}
        >
          <div
            className="relative h-48 w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            <div
              className="absolute inset-0 rounded-[1.25rem] border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-violet-500">
                Word
              </div>
              <div className="mt-5 text-2xl font-semibold leading-snug text-slate-900">
                {currentCard.front}
              </div>
              <div className="mt-4 text-sm text-slate-500">
                Recall it first, then tap to flip.
              </div>
            </div>
            <div
              className="absolute inset-0 rounded-[1.25rem] border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">
                Meaning and use
              </div>
              <div className="mt-5 text-lg font-semibold leading-snug text-slate-900">
                {currentCard.back}
              </div>
              <div className="mt-4 text-sm text-slate-600">
                Mark it, then the next chat turn will continue the review.
              </div>
            </div>
          </div>
        </button>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markCard("hard")}
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
          >
            Hard
          </button>
          <button
            type="button"
            onClick={() => markCard("easy")}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
          >
            Easy
          </button>
          <button
            type="button"
            onClick={() => goToCard(activeCard - 1)}
            disabled={activeCard === 0}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => goToCard(activeCard + 1)}
            disabled={activeCard === cards.length - 1}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-1">
            Status: {currentCard.status}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
            Easy {easyCount}
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
            Hard {hardCount}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-violet-500">
              Spacing & testing
            </div>
            <div className="mt-1 text-sm text-slate-600">
              One vocabulary card at a time. Each chatbot turn flips or advances
              the deck.
            </div>
          </div>
          <div className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-700">
            Card {activeCard + 1} / {cards.length}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {studyMoments.map((moment, index) => (
            <div
              key={moment}
              className={[
                "rounded-xl border px-3 py-2 text-center text-xs font-medium",
                index === activeCard
                  ? "border-violet-300 bg-violet-100 text-violet-800"
                  : "border-slate-200 bg-white text-slate-500",
              ].join(" ")}
            >
              {moment}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setFlipped((current) => !current);
            setLastInteraction(
              flipped
                ? `Turned card ${activeCard + 1} back to question`
                : `Flipped card ${activeCard + 1} to answer`,
            );
          }}
          className="mt-4 block w-full"
          style={{ perspective: "1200px" }}
        >
          <div
            className="relative h-64 w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            <div
              className="absolute inset-0 rounded-[1.75rem] border-2 border-violet-200 bg-white p-6 text-left shadow-sm"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-violet-500">
                Word
              </div>
              <div className="mt-6 text-2xl font-semibold leading-snug text-slate-900">
                {currentCard.front}
              </div>
              <div className="mt-6 text-sm text-slate-500">
                Try to recall the meaning before the chatbot flips the card.
              </div>
            </div>
            <div
              className="absolute inset-0 rounded-[1.75rem] border-2 border-emerald-200 bg-emerald-50 p-6 text-left shadow-sm"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">
                Meaning and use
              </div>
              <div className="mt-6 text-xl font-semibold leading-snug text-slate-900">
                {currentCard.back}
              </div>
              <div className="mt-6 text-sm text-slate-600">
                Mark it easy if it came quickly, or hard if this word should
                come back sooner.
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Vocabulary controls
            </div>
            <div className="text-xs text-slate-400">
              Latest: {lastInteraction}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToCard(activeCard - 1)}
              disabled={activeCard === 0}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToCard(activeCard + 1)}
              disabled={activeCard === cards.length - 1}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => markCard("hard")}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
            >
              Hard
            </button>
            <button
              type="button"
              onClick={() => markCard("easy")}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
            >
              Easy
            </button>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            Current status:{" "}
            <span className="font-medium text-slate-800">
              {currentCard.status}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Review progress
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <div className="text-xs text-emerald-700">Easy</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">
                {easyCount}
              </div>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <div className="text-xs text-amber-700">Hard</div>
              <div className="mt-1 text-2xl font-semibold text-amber-900">
                {hardCount}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                onClick={() => goToCard(index)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  index === activeCard
                    ? "border-violet-300 bg-violet-100 text-violet-800"
                    : card.status === "easy"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : card.status === "hard"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-500",
                ].join(" ")}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DyslexiaSupportVisualization({
  latestUserMessage,
  onStateChange,
}: {
  latestUserMessage?: string;
  onStateChange?: (state: VisualizationState) => void;
}) {
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const speechSequenceTokenRef = useRef(0);
  const hasHandledInitialFocusRef = useRef(false);
  const activeCharIntervalRef = useRef<number | null>(null);
  const previewChunksRef = useRef<HTMLDivElement>(null);
  const [sourceText, setSourceText] = useState(DEFAULT_DYSLEXIA_TEXT);
  const [displayMode, setDisplayMode] = useState<
    "chunked" | "spaced" | "guided-writing"
  >("chunked");
  const [fontMode, setFontMode] = useState<"default" | "opendyslexic-style">(
    "default",
  );
  const [spacingPreset, setSpacingPreset] = useState<
    "standard" | "comfortable" | "maximum"
  >("comfortable");
  const [supportPreset, setSupportPreset] = useState<
    "gentle-focus" | "guided-focus" | "sound-out"
  >("guided-focus");
  const [lineFocusEnabled, setLineFocusEnabled] = useState(true);
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [syllableHighlight, setSyllableHighlight] = useState(false);
  const [autoReadFocusedChunk, setAutoReadFocusedChunk] = useState(true);
  const [chunkSize, setChunkSize] = useState(1);
  const [focusChunk, setFocusChunk] = useState(0);
  const [activeSpokenChunk, setActiveSpokenChunk] = useState<number | null>(
    null,
  );
  const [activeSpokenSentence, setActiveSpokenSentence] = useState<
    number | null
  >(null);
  const [activeSpokenChar, setActiveSpokenChar] = useState<number | null>(null);
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [speechRate, setSpeechRate] = useState(0.75);
  const [speakingTarget, setSpeakingTarget] = useState<
    "none" | "focused-chunk" | "full-preview"
  >("none");
  const [rulerStyle, setRulerStyle] = useState<{
    left: number;
    width: number;
    top: number;
    opacity: number;
  }>({
    left: 0,
    width: 0,
    top: 0,
    opacity: 0,
  });
  const [lastInteraction, setLastInteraction] = useState(
    "Opened dyslexia support panel",
  );

  const readingChunks = useMemo(
    () => splitIntoReadingChunks(sourceText, chunkSize),
    [chunkSize, sourceText],
  );
  const adaptedText = useMemo(
    () => buildAdaptedReadingText(sourceText, displayMode, chunkSize),
    [chunkSize, displayMode, sourceText],
  );
  const keywords = useMemo(
    () => extractReadingKeywords(sourceText),
    [sourceText],
  );
  const sentenceFrame =
    "The main idea is ____. One important detail is ____. This helps me understand ____.";
  const checklist = [
    "Read one chunk at a time.",
    "Circle or say the key words.",
    "Use the sentence frame before writing on your own.",
  ];

  useEffect(() => {
    onStateChange?.({
      mode: "dyslexia-support",
      data: {
        sourceText,
        adaptedText,
        displayMode,
        fontMode,
        spacingPreset,
        lineFocusEnabled,
        maskEnabled,
        syllableHighlight,
        autoReadFocusedChunk,
        focusChunk,
        activeSpokenChunk,
        activeSpokenSentence,
        activeSpokenChar,
        speechRate,
        selectedVoice,
        speakingTarget,
        chunkSize,
        keywords,
        sentenceFrame,
        checklist,
        lastInteraction,
      },
    });
  }, [
    adaptedText,
    checklist,
    chunkSize,
    displayMode,
    fontMode,
    focusChunk,
    activeSpokenChunk,
    activeSpokenSentence,
    activeSpokenChar,
    autoReadFocusedChunk,
    keywords,
    lineFocusEnabled,
    lastInteraction,
    maskEnabled,
    onStateChange,
    selectedVoice,
    speakingTarget,
    speechRate,
    spacingPreset,
    sourceText,
    syllableHighlight,
  ]);

  const dyslexiaFriendlyStyle =
    fontMode === "opendyslexic-style"
      ? {
          fontFamily:
            '"OpenDyslexic", "Comic Sans MS", "Trebuchet MS", Verdana, Arial, sans-serif',
          letterSpacing: "0.04em",
          wordSpacing: "0.08em",
          fontWeight: 600,
        }
      : undefined;

  const spacingStyle =
    spacingPreset === "maximum"
      ? { letterSpacing: "0.1em", wordSpacing: "0.22em", lineHeight: 2.5 }
      : spacingPreset === "comfortable"
        ? { letterSpacing: "0.05em", wordSpacing: "0.12em", lineHeight: 2.15 }
        : { letterSpacing: "0.02em", wordSpacing: "0.06em", lineHeight: 1.9 };

  const previewTextStyle = { ...dyslexiaFriendlyStyle, ...spacingStyle };

  useEffect(() => {
    if (supportPreset === "gentle-focus") {
      setLineFocusEnabled(true);
      setMaskEnabled(false);
      setSyllableHighlight(false);
      return;
    }

    if (supportPreset === "guided-focus") {
      setLineFocusEnabled(true);
      setMaskEnabled(true);
      setSyllableHighlight(false);
      return;
    }

    setLineFocusEnabled(true);
    setMaskEnabled(true);
    setSyllableHighlight(true);
  }, [supportPreset]);

  useEffect(() => {
    if (!readingChunks.length) {
      setFocusChunk(0);
      return;
    }
    setFocusChunk((current) => Math.min(current, readingChunks.length - 1));
  }, [readingChunks.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    speechSynthesisRef.current = synth;

    const updateVoices = () => {
      const voices = synth.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoice && voices[0]?.name) {
        setSelectedVoice(voices[0].name);
      }
    };

    updateVoices();
    synth.addEventListener?.("voiceschanged", updateVoices);

    return () => {
      synth.cancel();
      if (activeCharIntervalRef.current) {
        window.clearInterval(activeCharIntervalRef.current);
        activeCharIntervalRef.current = null;
      }
      synth.removeEventListener?.("voiceschanged", updateVoices);
    };
  }, [selectedVoice]);

  function speakText(text: string, target: "focused-chunk" | "full-preview") {
    const synth = speechSynthesisRef.current;
    if (!synth || !text.trim()) return;

    const sequence =
      target === "focused-chunk"
        ? splitIntoSentences(text).map((sentence, index) => ({
            chunkIndex: focusChunk,
            sentenceIndex: index,
            text: sentence,
          }))
        : readingChunks.flatMap((chunk, chunkIndex) =>
            splitIntoSentences(chunk).map((sentence, sentenceIndex) => ({
              chunkIndex,
              sentenceIndex,
              text: sentence,
            })),
          );

    if (!sequence.length) return;

    speechSequenceTokenRef.current += 1;
    const token = speechSequenceTokenRef.current;
    synth.cancel();

    const matchedVoice = availableVoices.find(
      (voice) => voice.name === selectedVoice,
    );

    if (activeCharIntervalRef.current) {
      window.clearInterval(activeCharIntervalRef.current);
      activeCharIntervalRef.current = null;
    }

    const speakNext = (index: number) => {
      if (speechSequenceTokenRef.current !== token) return;

      const current = sequence[index];
      if (!current) {
        setSpeakingTarget("none");
        setActiveSpokenChunk(null);
        setActiveSpokenSentence(null);
        setActiveSpokenChar(null);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(current.text);
      const tokens = tokenizeSpeechText(current.text);
      utterance.rate = speechRate;
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onstart = () => {
        setSpeakingTarget(target);
        setActiveSpokenChunk(current.chunkIndex);
        setActiveSpokenSentence(current.sentenceIndex);
        setActiveSpokenChar(0);
      };
      utterance.onboundary = (event) => {
        if (speechSequenceTokenRef.current !== token) return;
        const charIndex = event.charIndex ?? 0;
        setActiveSpokenChar(charIndex);

        const activeToken =
          tokens.find(
            (tokenEntry) =>
              tokenEntry.isWord &&
              charIndex >= tokenEntry.start &&
              charIndex < tokenEntry.end,
          ) ||
          tokens.find(
            (tokenEntry) => tokenEntry.isWord && tokenEntry.start >= charIndex,
          );

        if (!activeToken) return;

        if (activeCharIntervalRef.current) {
          window.clearInterval(activeCharIntervalRef.current);
        }

        let nextChar = Math.max(charIndex, activeToken.start);
        activeCharIntervalRef.current = window.setInterval(
          () => {
            if (speechSequenceTokenRef.current !== token) {
              if (activeCharIntervalRef.current) {
                window.clearInterval(activeCharIntervalRef.current);
                activeCharIntervalRef.current = null;
              }
              return;
            }

            setActiveSpokenChar(nextChar);
            nextChar += 1;

            if (nextChar >= activeToken.end) {
              if (activeCharIntervalRef.current) {
                window.clearInterval(activeCharIntervalRef.current);
                activeCharIntervalRef.current = null;
              }
            }
          },
          Math.max(22, Math.round(55 / speechRate)),
        );
      };
      utterance.onend = () => {
        if (speechSequenceTokenRef.current !== token) return;
        if (activeCharIntervalRef.current) {
          window.clearInterval(activeCharIntervalRef.current);
          activeCharIntervalRef.current = null;
        }
        speakNext(index + 1);
      };
      utterance.onerror = () => {
        if (speechSequenceTokenRef.current !== token) return;
        if (activeCharIntervalRef.current) {
          window.clearInterval(activeCharIntervalRef.current);
          activeCharIntervalRef.current = null;
        }
        setSpeakingTarget("none");
        setActiveSpokenChunk(null);
        setActiveSpokenSentence(null);
        setActiveSpokenChar(null);
      };

      synth.speak(utterance);
    };

    speakNext(0);
  }

  function stopSpeech() {
    speechSequenceTokenRef.current += 1;
    speechSynthesisRef.current?.cancel();
    if (activeCharIntervalRef.current) {
      window.clearInterval(activeCharIntervalRef.current);
      activeCharIntervalRef.current = null;
    }
    setSpeakingTarget("none");
    setActiveSpokenChunk(null);
    setActiveSpokenSentence(null);
    setActiveSpokenChar(null);
    setLastInteraction("Stopped speech");
  }

  useEffect(() => {
    if (!readingChunks.length || !autoReadFocusedChunk) return;
    if (!hasHandledInitialFocusRef.current) {
      hasHandledInitialFocusRef.current = true;
      return;
    }

    const focusedText = readingChunks[focusChunk];
    if (!focusedText?.trim()) return;

    const timer = window.setTimeout(() => {
      speakText(focusedText, "focused-chunk");
      setLastInteraction(`Auto-read focused chunk ${focusChunk + 1}`);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [autoReadFocusedChunk, focusChunk, readingChunks]);

  useEffect(() => {
    const container = previewChunksRef.current;
    if (!container) return;

    const activeWord = container.querySelector(
      '[data-reading-active-word="true"]',
    ) as HTMLElement | null;

    if (!activeWord) {
      setRulerStyle((current) => ({ ...current, opacity: 0 }));
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const wordRect = activeWord.getBoundingClientRect();

    setRulerStyle({
      left: wordRect.left - containerRect.left + 4,
      width: Math.max(18, wordRect.width - 8),
      top: wordRect.bottom - containerRect.top + 2,
      opacity: 1,
    });
  }, [
    activeSpokenChar,
    activeSpokenChunk,
    activeSpokenSentence,
    focusChunk,
    speakingTarget,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Original literacy task
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Paste a reading or writing activity to generate a more accessible
              version.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!latestUserMessage?.trim()) return;
              setSourceText(latestUserMessage.trim());
              setLastInteraction("Used latest learner text");
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Use latest message
          </button>
        </div>
        <textarea
          rows={6}
          value={sourceText}
          onChange={(event) => {
            setSourceText(event.target.value);
            setLastInteraction("Edited source text");
          }}
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-sky-400"
          style={dyslexiaFriendlyStyle}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-slate-600">
              <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">
                Reading view
              </span>
              <select
                value={displayMode}
                onChange={(event) => {
                  setDisplayMode(
                    event.target.value as
                      | "chunked"
                      | "spaced"
                      | "guided-writing",
                  );
                  setLastInteraction("Changed reading view");
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="chunked">Chunked reading</option>
                <option value="spaced">Extra spacing</option>
                <option value="guided-writing">Guided writing</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">
                Support level
              </span>
              <select
                value={supportPreset}
                onChange={(event) => {
                  setSupportPreset(
                    event.target.value as
                      | "gentle-focus"
                      | "guided-focus"
                      | "sound-out",
                  );
                  setLastInteraction("Changed support level");
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="gentle-focus">Gentle focus</option>
                <option value="guided-focus">Guided focus</option>
                <option value="sound-out">Sound-out support</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">
                Font
              </span>
              <select
                value={fontMode}
                onChange={(event) => {
                  setFontMode(
                    event.target.value as "default" | "opendyslexic-style",
                  );
                  setLastInteraction("Changed font");
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="default">Default font</option>
                <option value="opendyslexic-style">OpenDyslexic-style</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">
                Spacing
              </span>
              <select
                value={spacingPreset}
                onChange={(event) => {
                  setSpacingPreset(
                    event.target.value as
                      | "standard"
                      | "comfortable"
                      | "maximum",
                  );
                  setLastInteraction("Changed spacing");
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="standard">Standard</option>
                <option value="comfortable">Comfortable</option>
                <option value="maximum">Maximum</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Chunk size:{" "}
              <select
                value={chunkSize}
                onChange={(event) => {
                  setChunkSize(Number(event.target.value));
                  setLastInteraction("Changed chunk size");
                }}
                className="ml-1 h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700"
              >
                <option value={1}>1 sentence</option>
                <option value={2}>2 sentences</option>
                <option value={3}>3 sentences</option>
              </select>
            </span>
            <span>
              Auto-read:{" "}
              <button
                type="button"
                onClick={() => {
                  setAutoReadFocusedChunk((value) => !value);
                  setLastInteraction(
                    `${autoReadFocusedChunk ? "Disabled" : "Enabled"} auto-read focused chunk`,
                  );
                }}
                className="ml-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {autoReadFocusedChunk ? "On" : "Off"}
              </button>
            </span>
            <span>
              {supportPreset === "sound-out"
                ? "Includes focus ruler, mask, and syllable support."
                : supportPreset === "guided-focus"
                  ? "Includes focus ruler and reading mask."
                  : "Includes a gentle focus ruler."}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Accessible preview
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={stopSpeech}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Stop
              </button>
              <select
                value={selectedVoice}
                onChange={(event) => {
                  setSelectedVoice(event.target.value);
                  setLastInteraction("Changed voice");
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                {availableVoices.length ? (
                  availableVoices.map((voice) => (
                    <option
                      key={`${voice.name}-${voice.lang}`}
                      value={voice.name}
                    >
                      {voice.name} ({voice.lang})
                    </option>
                  ))
                ) : (
                  <option value="">System voice</option>
                )}
              </select>
              <select
                value={speechRate}
                onChange={(event) => {
                  setSpeechRate(Number(event.target.value));
                  setLastInteraction("Changed speech rate");
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value={0.6}>Comfortable</option>
                <option value={0.75}>Slow</option>
                <option value={0.9}>Normal</option>
              </select>
              <div className="ml-auto text-xs text-slate-500">
                {speakingTarget === "none"
                  ? "Speech idle"
                  : speakingTarget === "focused-chunk"
                    ? `Reading chunk ${focusChunk + 1}`
                    : "Reading full preview"}
              </div>
            </div>
            {readingChunks.length ? (
              <div ref={previewChunksRef} className="relative mt-3 space-y-3">
                <div
                  className="pointer-events-none absolute z-20 h-1.5 rounded-full bg-sky-400/80 shadow-[0_0_0_1px_rgba(125,211,252,0.35),0_6px_18px_rgba(56,189,248,0.18)] transition-[transform,width,opacity] duration-200 ease-out"
                  style={{
                    width: `${rulerStyle.width}px`,
                    opacity: rulerStyle.opacity,
                    transform: `translate(${rulerStyle.left}px, ${rulerStyle.top}px)`,
                  }}
                />
                {readingChunks.map((chunk, index) => {
                  const isActive = index === focusChunk;
                  const previewChunk =
                    displayMode === "guided-writing"
                      ? `Part ${index + 1}: ${chunk}`
                      : chunk;

                  return (
                    <div
                      key={`${chunk}-${index}`}
                      onClick={() => {
                        setFocusChunk(index);
                        setLastInteraction(`Focused chunk ${index + 1}`);
                      }}
                      className={[
                        "relative block w-full rounded-xl border px-4 py-3 text-left transition",
                        lineFocusEnabled && isActive
                          ? "border-sky-300 bg-white shadow-sm ring-2 ring-sky-100"
                          : "border-transparent bg-white/70",
                        maskEnabled && !isActive
                          ? "opacity-30 saturate-50"
                          : activeSpokenChunk != null &&
                              activeSpokenChunk !== index
                            ? "opacity-60"
                            : "opacity-100",
                      ].join(" ")}
                    >
                      {lineFocusEnabled && isActive && (
                        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-amber-400" />
                      )}
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Chunk {index + 1}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFocusChunk(index);
                            speakText(chunk, "focused-chunk");
                            setLastInteraction(`Played chunk ${index + 1}`);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                          title={`Read aloud chunk ${index + 1}`}
                          aria-label={`Read aloud chunk ${index + 1}`}
                        >
                          <Icon
                            d="M3 10v4a1 1 0 001 1h3l4 3V6L7 9H4a1 1 0 00-1 1zm11.5 2a3.5 3.5 0 00-2-3.15v6.3a3.5 3.5 0 002-3.15zm0-7.5v2.05a7 7 0 010 10.9v2.05a1 1 0 001.56.83 9 9 0 000-16.66 1 1 0 00-1.56.83z"
                            className="h-4 w-4"
                          />
                        </button>
                      </div>
                      <div
                        className={[
                          "whitespace-pre-wrap text-slate-900",
                          displayMode === "spaced" ? "text-lg" : "text-base",
                        ].join(" ")}
                        style={previewTextStyle}
                      >
                        {splitIntoSentences(previewChunk).map(
                          (sentence, sentenceIndex) => {
                            const isActiveSentence =
                              activeSpokenChunk === index &&
                              activeSpokenSentence === sentenceIndex;
                            const isSentenceDimmed =
                              activeSpokenChunk === index &&
                              activeSpokenSentence != null &&
                              activeSpokenSentence !== sentenceIndex;
                            return (
                              <span
                                key={`${index}-${sentenceIndex}-${sentence}`}
                                className={`rounded-2xl px-1.5 py-1 transition-all duration-200 ${
                                  isActiveSentence
                                    ? "bg-amber-50 shadow-sm ring-1 ring-amber-200"
                                    : isSentenceDimmed
                                      ? "opacity-35"
                                      : ""
                                }`}
                              >
                                {renderSpeechAwareSentence(
                                  `${sentence} `,
                                  isActiveSentence ? activeSpokenChar : null,
                                  syllableHighlight,
                                )}
                              </span>
                            );
                          },
                        )}
                      </div>
                    </div>
                  );
                })}
                {displayMode === "guided-writing" && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Writing frame
                    </div>
                    <div className="mt-2" style={previewTextStyle}>
                      {renderSyllableText(
                        "The main idea is ____. One detail is ____. Another detail is ____.",
                        syllableHighlight,
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-500">
                Add a reading or writing task to preview the accessible version.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Key words
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {keywords.length ? (
                keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                  >
                    {keyword}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  Keywords will appear here.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Sentence frame
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm leading-7 text-slate-700">
              <span style={previewTextStyle}>
                {renderSyllableText(sentenceFrame, syllableHighlight)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Support checklist
            </div>
            <div className="mt-3 space-y-2">
              {checklist.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
                    ✓
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-500">
              Latest interaction: {lastInteraction}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunctionGraphVisualization({
  appId,
  latestAssistantMessage,
}: {
  appId: string;
  latestAssistantMessage?: string;
}) {
  const rhsHint = useMemo(
    () => extractPlottableRhs(latestAssistantMessage),
    [latestAssistantMessage],
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedRhs, setFailedRhs] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rhsHint || !appId.trim()) {
      setImageDataUrl(null);
      setLoadError(null);
      setFailedRhs(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setFailedRhs(null);
    setImageDataUrl(null);
    void (async () => {
      try {
        const res = await fetch("/api/math/function-plot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId,
            assistantMessage: latestAssistantMessage ?? "",
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reason?: string;
          rhs?: string;
          imageDataUrl?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            typeof body.error === "string"
              ? body.error
              : "Could not load chart",
          );
          setLoading(false);
          return;
        }
        if (body.ok === true && typeof body.imageDataUrl === "string") {
          setImageDataUrl(body.imageDataUrl);
          setLoading(false);
          return;
        }
        if (body.ok === false) {
          if (body.reason === "parse_error" || body.reason === "no_data") {
            setFailedRhs(typeof body.rhs === "string" ? body.rhs : rhsHint);
          }
          setLoading(false);
          return;
        }
        setLoadError("Could not render plot");
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Network error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, latestAssistantMessage, rhsHint]);

  if (!rhsHint && !loading) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm text-slate-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-zinc-200">
        <p className="font-medium text-indigo-900 dark:text-indigo-200">
          Function plot preview
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
          When the assistant&apos;s latest reply includes a line like{" "}
          <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-900">
            y = x^2 - 1
          </code>{" "}
          or{" "}
          <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-900">
            f(x) = …
          </code>
          , the chart is rendered via{" "}
          <span className="font-medium">QuickChart.io</span>.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 px-4 py-6 text-center text-sm text-slate-600 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-zinc-300">
        Generating plot with QuickChart…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
        {loadError}
      </div>
    );
  }

  if (failedRhs) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-medium">Could not plot this expression</p>
        <p className="mt-1 font-mono text-xs opacity-90">{failedRhs}</p>
        <p className="mt-2 text-xs opacity-80">
          Use a single-line function in x (e.g. polynomials, sin, cos, sqrt).
          Put fractions in{" "}
          <code className="rounded bg-white/60 px-1 dark:bg-zinc-900">a/b</code>{" "}
          or simple LaTeX{" "}
          <code className="rounded bg-white/60 px-1 dark:bg-zinc-900">
            \frac&#123;a&#125;&#123;b&#125;
          </code>
          .
        </p>
      </div>
    );
  }

  if (imageDataUrl) {
    return (
      <div className="space-y-2">
        <img
          src={imageDataUrl}
          alt={rhsHint ? `Graph of y = ${rhsHint}` : "Function graph"}
          className="w-full rounded-2xl border border-indigo-200 bg-white dark:border-indigo-900/50"
        />
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
          Rendered by{" "}
          <a
            href="https://quickchart.io/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
          >
            QuickChart
          </a>{" "}
          (Chart.js). x ∈ [−6, 6].
        </p>
      </div>
    );
  }

  return null;
}

export function VisualizationSurface({
  mode,
  appId = "",
  latestUserMessage,
  latestAssistantMessage,
  assistantTurnCount,
  embedded = false,
  onStateChange,
}: {
  mode:
    | "code-tracing"
    | "spacing-testing"
    | "music-staff"
    | "virtual-lab"
    | "dyslexia-support"
    | "function-graph";
  appId?: string;
  latestUserMessage?: string;
  latestAssistantMessage?: string;
  assistantTurnCount?: number;
  embedded?: boolean;
  onStateChange?: (state: VisualizationState) => void;
}) {
  if (mode === "spacing-testing") {
    return (
      <SpacingTestingVisualization
        latestUserMessage={latestUserMessage}
        assistantTurnCount={assistantTurnCount}
        embedded={embedded}
        onStateChange={onStateChange}
      />
    );
  }

  if (mode === "code-tracing") {
    return (
      <TraceVisualization
        latestUserMessage={latestUserMessage}
        onStateChange={onStateChange}
      />
    );
  }

  if (mode === "music-staff") {
    return <MusicStaffVisualization onStateChange={onStateChange} />;
  }

  if (mode === "dyslexia-support") {
    return (
      <DyslexiaSupportVisualization
        latestUserMessage={latestUserMessage}
        onStateChange={onStateChange}
      />
    );
  }

  if (mode === "function-graph") {
    return (
      <FunctionGraphVisualization
        appId={appId}
        latestAssistantMessage={latestAssistantMessage}
      />
    );
  }

  return <VirtualLabVisualization onStateChange={onStateChange} />;
}

export function getVisualizationTitle(
  mode:
    | "code-tracing"
    | "spacing-testing"
    | "music-staff"
    | "virtual-lab"
    | "dyslexia-support"
    | "function-graph",
  fullscreen: boolean,
) {
  if (mode === "spacing-testing") {
    return fullscreen ? "Flashcard practice deck" : "Embedded flashcard deck";
  }

  if (mode === "code-tracing") {
    return fullscreen ? "Code tracing visualizer" : "Embedded code trace view";
  }

  if (mode === "music-staff") {
    return fullscreen ? "Music staff visualizer" : "Embedded music staff view";
  }

  if (mode === "dyslexia-support") {
    return fullscreen
      ? "Dyslexia-friendly literacy support"
      : "Embedded dyslexia support view";
  }

  if (mode === "function-graph") {
    return fullscreen ? "Function graph preview" : "Embedded function graph";
  }

  return fullscreen ? "Virtual lab visualizer" : "Embedded virtual lab view";
}

function getInitialMessages(
  appName: string,
  studentProfile: StudentProfile | null = null,
  preset?: TestCasePreset,
  readOnly = false,
): ChatMessage[] {
  if (readOnly) {
    return [
      createMessage(
        "assistant",
        `This is a read-only preview of ${appName}.\n\nYou can inspect the chatbot setup and visualization, but not edit or chat from this shared project view.`,
      ),
    ];
  }

  const studentLabel = studentProfile?.label || "Student";
  const gradeLevel = studentProfile?.gradeLevel || "middle school";
  const personality = studentProfile?.personality || "thoughtful and curious";
  const knowledgeLevel =
    studentProfile?.knowledgeLevel || "still building core understanding";
  const purposeLabel = preset?.purposeLabel || "Custom case";
  const scenarioSummary =
    preset?.scenarioSummary || "A custom student simulation.";

  return [
    createMessage(
      "assistant",
      `Hi! I'm ${appName}. This testcase is ${purposeLabel.toLowerCase()}.\n\nStudent: ${studentLabel}\nProfile: ${gradeLevel}; ${knowledgeLevel}; ${personality}\nScenario: ${scenarioSummary}`,
    ),
    createMessage(
      "user",
      `I'm ${studentLabel}. I'm in ${gradeLevel}. ${preset?.round1User || "Can you help me get started?"}`,
    ),
    createMessage(
      "assistant",
      preset?.round1Assistant ||
        "Absolutely. I will start small, use plain language, and check your understanding before moving on.",
    ),
    createMessage(
      "user",
      preset?.round2User ||
        "I think I partly get it, but I still feel unsure and might be mixing up a few ideas.",
    ),
    createMessage(
      "assistant",
      preset?.round2Assistant ||
        "Thanks for telling me. Let's focus on one key idea, test it with a short example, and then compare it with the idea you might be confusing it with.",
    ),
    createMessage(
      "user",
      preset?.round3User ||
        "Can I try answering in my own words first, and then you tell me what I understood well and what I should fix?",
    ),
  ];
}

export type AssistantPanelSpotlightTargetRefs = {
  simulatedChat: RefObject<HTMLDivElement | null>;
  case0: RefObject<HTMLDivElement | null>;
  case1: RefObject<HTMLDivElement | null>;
  addCase: RefObject<HTMLButtonElement | null>;
  markPass: RefObject<HTMLButtonElement | null>;
};

export default function AssistantPanel({
  appId,
  appName,
  appVersion,
  readOnly = false,
  promptOverride,
  modelLabelOverride,
  assistedAuthoringMode = true,
  spotlightTargetRefs,
  onTestCaseStatusChange,
  modePanelBootstrapAction,
  onModePanelBootstrapComplete,
  onOffToOnError,
}: {
  appId: string;
  appName: string;
  appVersion?: number;
  readOnly?: boolean;
  promptOverride?: string;
  modelLabelOverride?: string;
  /** Assisted authoring mode flag: true = ON (auto-gen, prompt revision), false = OFF. Defaults to true. */
  assistedAuthoringMode?: boolean;
  /** Refs on testcase UI regions for the editor-page spotlight tour (optional). */
  spotlightTargetRefs?: AssistantPanelSpotlightTargetRefs;
  onTestCaseStatusChange?: (status: TestCaseStatus) => void;
  /** Mode transition bootstrap: enter try-chat (ON→OFF) or regenerate assisted suite (OFF→ON). */
  modePanelBootstrapAction?:
    | { action: "enter-try-chat" }
    | { action: "regenerate" }
    | null;
  /** Callback when mode panel bootstrap completes successfully. */
  onModePanelBootstrapComplete?: () => void;
  /** Callback when OFF→ON regenerate fails. */
  onOffToOnError?: (error: string) => void;
}) {
  const displayName = appName.trim() || appId;
  const assistedOn = isAssistedBehaviorEnabled(assistedAuthoringMode);
  const [input, setInput] = useState("");
  const [testCases, setTestCases] = useState<TestCaseSet[]>(() =>
    readOnly
      ? createInitialTestCases(displayName, true)
      : assistedOn
        ? createInitialTestCases(displayName, false)
        : [createTryChatCase(displayName)],
  );
  const [activeTestCaseId, setActiveTestCaseId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [attachedFileName, setAttachedFileName] = useState("");
  const [attachedFileText, setAttachedFileText] = useState("");
  const [attachedImageName, setAttachedImageName] = useState("");
  const [attachedImageUrl, setAttachedImageUrl] = useState("");
  const [modelLabel, setModelLabel] = useState("Loading model...");
  const [promptMarkdown, setPromptMarkdown] = useState("");
  const [serverSystemPrompt, setServerSystemPrompt] = useState("");
  const [visualFullscreen, setVisualFullscreen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySummary, setApplySummary] = useState("");
  const [pipelineResult, setPipelineResult] =
    useState<PromptUpdateResult | null>(null);
  const [batchRunProgress, setBatchRunProgress] =
    useState<BatchRunProgress | null>(null);
  /** Full-panel overlay (same UI as batch run); separate from batch so clears do not race. */
  const [dialogueGenProgress, setDialogueGenProgress] =
    useState<BatchRunProgress | null>(null);
  const [testCaseEditDraft, setTestCaseEditDraft] =
    useState<TestCaseEditDraft | null>(null);
  const [expandedStudentDetailIds, setExpandedStudentDetailIds] = useState<
    Set<string>
  >(() => new Set());
  const [addTestCaseChoiceOpen, setAddTestCaseChoiceOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const testCasesRef = useRef<TestCaseSet[]>([]);
  /** Only reset session when appId/readOnly actually change (not on mount). Survives React Strict Mode double-invoked effects. */
  const prevSessionResetKeyRef = useRef<{
    appId: string;
    readOnly: boolean;
  } | null>(null);
  /** One-shot auto-run of scripted testcase dialogue when a new app already has a prompt but user has not clicked Apply yet. */
  const didBootstrapSimulatedDialogueRef = useRef(false);
  /** Track in-progress mode panel bootstrap to prevent double-fire. */
  const modePanelBootstrapInProgressRef = useRef<string | null>(null);
  /** Bumped to invalidate in-flight assisted generation when switching to try-chat. */
  const assistedWorkEpochRef = useRef(0);
  const dialogueAbortRef = useRef<AbortController | null>(null);
  const editorTestRecording = useMemo(() => createEditorTestRecording(), []);

  const visualizationMode = useMemo(
    () => detectVisualizationMode(promptMarkdown),
    [promptMarkdown],
  );
  const activeTestCase =
    testCases.find((testCase) => testCase.id === activeTestCaseId) ||
    testCases[0] ||
    null;
  const messages = activeTestCase?.messages || [];
  const visualizationState = activeTestCase?.visualizationState || null;
  const activeStudentProfile = activeTestCase?.studentProfile || null;
  const passedCaseCount = testCases.filter(
    (testCase) => testCase.passed,
  ).length;
  const verifiedCaseCount = testCases.filter(
    (testCase) => testCase.verificationStatus === "pass",
  ).length;
  const warningCaseCount = testCases.filter(
    (testCase) => testCase.verificationStatus === "warning",
  ).length;
  const failedCaseCount = testCases.filter(
    (testCase) => testCase.verificationStatus === "fail",
  ).length;
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  const assistantTurnCount = messages.filter(
    (message) => message.role === "assistant",
  ).length;
  const editedMessageCount = messages.filter(messageHasEdits).length;
  /** "Update prompt" strip is for bubble edits / pipeline — hide when idle so it is not mistaken for global loading. Gate when assisted mode is off. */
  const showApplyPromptStrip =
    assistedOn &&
    (editedMessageCount > 0 ||
      applyBusy ||
      Boolean(applyError) ||
      Boolean(pipelineResult));
  const panelBlockingProgress = batchRunProgress ?? dialogueGenProgress;

  useEffect(() => {
    testCasesRef.current = testCases;
  }, [testCases]);

  const fetchAndApplyScriptedDialogues = useCallback(
    async (
      scripted: TestCaseSet[],
      options?: { systemPromptOverride?: string },
    ) => {
      const basePrompt =
        options?.systemPromptOverride?.trim() ||
        resolveAssistantSystemPrompt({
          promptMarkdown,
          appId,
          serverSystemPrompt,
        }).trim();
      if (!basePrompt) {
        throw new Error(
          "Add a Final Prompt before generating test-case dialogue.",
        );
      }
      if (!scripted.length) return;

      dialogueAbortRef.current?.abort();
      const abort = new AbortController();
      dialogueAbortRef.current = abort;
      const workEpoch = ++assistedWorkEpochRef.current;

      const detail =
        scripted.length === 1
          ? `Generating 5-turn preview for ${scripted[0].purposeLabel}…`
          : `Generating 5-turn previews for ${scripted.length} test cases…`;
      setDialogueGenProgress({
        title: "Updating current testcases",
        detail,
      });

      try {
        const res = await fetch("/api/test-cases/generate-dialogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            appId,
            systemPrompt: basePrompt,
            rounds: 5,
            cases: scripted.map((tc) => ({
              caseId: tc.id,
              profile: tc.studentProfile!,
              scenarioSummary: tc.scenarioSummary,
              purposeLabel: tc.purposeLabel,
            })),
          }),
        });
        if (assistedWorkEpochRef.current !== workEpoch) return;

        const body = await res.json().catch(() => ({}));
        if (assistedWorkEpochRef.current !== workEpoch) return;
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Dialogue generation failed",
          );
        }
        const results = Array.isArray(body.results) ? body.results : [];
        type RawMsg = { role: string; content: string };
        type ResultRow = { caseId: string; messages: RawMsg[] };
        const byId = new Map<string, RawMsg[]>(
          (results as ResultRow[])
            .filter((r) => r?.caseId && Array.isArray(r.messages))
            .map((r) => [r.caseId, r.messages]),
        );

        setTestCases((current) =>
          current.map((tc) => {
            if (tc.warmStart !== "scripted") return tc;
            const raw = byId.get(tc.id);
            if (!raw?.length) return tc;
            const msgs = raw.map((m) =>
              createMessage(
                m.role === "user" ? "user" : "assistant",
                typeof m.content === "string" ? m.content : "",
              ),
            );
            const userTurns = msgs
              .filter((m) => m.role === "user")
              .map((m) => m.content);
            return { ...tc, messages: msgs, simulatedUserTurns: userTurns };
          }),
        );
      } catch (error) {
        if (
          abort.signal.aborted ||
          assistedWorkEpochRef.current !== workEpoch ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        throw error;
      } finally {
        if (dialogueAbortRef.current === abort) {
          dialogueAbortRef.current = null;
        }
        if (assistedWorkEpochRef.current === workEpoch) {
          setDialogueGenProgress(null);
        }
      }
    },
    [appId, promptMarkdown, serverSystemPrompt],
  );

  async function loadApp() {
    if (readOnly) {
      setModelLabel(modelLabelOverride || "Shared project preview");
      setServerSystemPrompt("");
      return;
    }

    try {
      const res = await fetch(`/api/apps/${appId}`);
      const body = await res.json();

      if (res.ok && body?.app) {
        setModelLabel(`${body.app.provider} · ${body.app.model}`);
        setServerSystemPrompt(
          (typeof body.app.systemPrompt === "string"
            ? body.app.systemPrompt.trim()
            : "") ||
            (typeof body.app.description === "string"
              ? body.app.description.trim()
              : ""),
        );
        return;
      }

      setModelLabel("Unknown model");
      setServerSystemPrompt("");
    } catch {
      setModelLabel("Unknown model");
      setServerSystemPrompt("");
    }
  }

  async function requestPreviewReply(args: {
    system: string;
    messages: ChatMessage[];
    visualizationState: VisualizationState | null;
  }) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId,
        system: args.system,
        messages: args.messages.map(({ role, content, imageUrl }) => ({
          role,
          content,
          ...(imageUrl ? { imageUrl } : {}),
        })),
        visualizationState: args.visualizationState,
        recording: editorTestRecording.buildPayload(
          activeTestCase?.id ?? "editor-test",
          args.messages,
        ),
      }),
    });

    const contentType = res.headers.get("content-type") || "";
    const isJSON = contentType.includes("application/json");
    const body = isJSON ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = isJSON
        ? body?.error || body?.message || "Server error"
        : String(body).slice(0, 400);
      throw new Error(msg);
    }

    const reply = isJSON ? (body?.reply ?? "") : String(body);
    if (isJSON && body?.provider && body?.model) {
      setModelLabel(`${body.provider} · ${body.model}`);
    }

    return reply;
  }

  function updateTestCaseById(
    testCaseId: string,
    updater: (testCase: TestCaseSet) => TestCaseSet,
  ) {
    setTestCases((current) =>
      current.map((testCase) =>
        testCase.id === testCaseId ? updater(testCase) : testCase,
      ),
    );
  }

  function updateActiveTestCase(
    updater: (testCase: TestCaseSet) => TestCaseSet,
  ) {
    const fallbackId = activeTestCase?.id;
    if (!fallbackId) return;
    updateTestCaseById(fallbackId, updater);
  }

  function clearPromptUpdateState(resetCaseVerification = false) {
    setApplyError("");
    setApplySummary("");
    setPipelineResult(null);
    if (resetCaseVerification) {
      setTestCases((current) =>
        current.map((testCase) => ({
          ...testCase,
          verificationStatus: "idle",
          verificationNote: "",
        })),
      );
    }
  }

  function clearComposerAttachments() {
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setEditingMessageId(null);
    setEditingDraft("");
    setApplyBusy(false);
    clearPromptUpdateState();
  }

  /** Stop assisted generation overlays / in-flight work when leaving ON for try-chat. */
  function cancelAssistedGeneration() {
    assistedWorkEpochRef.current += 1;
    dialogueAbortRef.current?.abort();
    dialogueAbortRef.current = null;
    didBootstrapSimulatedDialogueRef.current = false;
    setDialogueGenProgress(null);
    setBatchRunProgress(null);
    setBusy(false);
    setApplyBusy(false);
  }

  function applyTryChatSession() {
    cancelAssistedGeneration();
    const next = createTryChatCase(displayName);
    setTestCases([next]);
    setActiveTestCaseId(next.id);
    setExpandedStudentDetailIds(new Set());
    clearComposerAttachments();
  }

  function clearTryConversation() {
    applyTryChatSession();
    setApplySummary(
      "Conversation cleared. Start a new try whenever you’re ready.",
    );
  }

  function resetSession() {
    didBootstrapSimulatedDialogueRef.current = false;
    if (!readOnly && !isAssistedBehaviorEnabled(assistedAuthoringMode)) {
      applyTryChatSession();
      return;
    }
    const nextCases = createInitialTestCases(displayName, readOnly);
    setTestCases(nextCases);
    setActiveTestCaseId(nextCases[0]?.id || "");
    setExpandedStudentDetailIds(new Set());
    clearComposerAttachments();
  }

  function resetActiveTestCase() {
    const tc = activeTestCase;
    if (!tc) return;
    editorTestRecording.resetCase(tc.id);

    if (tc.warmStart === "scripted") {
      updateActiveTestCase(() => ({
        ...tc,
        messages: [],
        simulatedUserTurns: undefined,
        visualizationState: null,
        passed: false,
        verificationStatus: "idle",
        verificationNote: "",
      }));
      setInput("");
      setAttachedFileName("");
      setAttachedFileText("");
      setAttachedImageName("");
      setAttachedImageUrl("");
      setEditingMessageId(null);
      setEditingDraft("");
      clearPromptUpdateState();
      return;
    }

    updateActiveTestCase((testCase) => ({
      ...testCase,
      messages:
        testCase.teacherEntry === "configure"
          ? getTeacherConfigureFirstMessages(displayName)
          : getTeacherScratchStartMessages(displayName, testCase.script),
      visualizationState: null,
      passed: false,
      verificationStatus: "idle",
      verificationNote: "",
    }));
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setEditingMessageId(null);
    setEditingDraft("");
    clearPromptUpdateState();
  }

  function confirmAddTestCase(entry: TeacherEntryMode) {
    const nextIndex = testCases.length + 1;
    const studentProfile = buildStudentProfileForCase(nextIndex - 1);
    const preset: TestCasePreset = {
      purposeLabel: "Custom case",
      scenarioSummary: "An extra student simulation added by the teacher.",
      round1User: "Can you help me get started?",
      round1Assistant: "Absolutely. Let's start with one manageable step.",
      round2User: "I think I partly get it, but I still need support.",
      round2Assistant: "Let's slow it down and test one idea at a time.",
      round3User: "Can I try one final response on my own?",
    };
    const nextCase = createTestCaseSet(
      studentProfile.label,
      displayName,
      readOnly,
      studentProfile,
      preset,
      {
        warmStart: "teacher",
        teacherEntry: entry,
        ...(entry === "configure" ? { autoDialoguePending: true } : {}),
      },
    );
    setTestCases((current) => [...current, nextCase]);
    setActiveTestCaseId(nextCase.id);
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setEditingMessageId(null);
    setEditingDraft("");
    clearPromptUpdateState();
    setAddTestCaseChoiceOpen(false);
    if (entry === "configure") {
      openTestCaseEdit(nextCase);
    }
  }

  function openTestCaseEdit(testCase: TestCaseSet) {
    setExpandedStudentDetailIds((prev) => {
      const next = new Set(prev);
      next.add(testCase.id);
      return next;
    });
    const profile = testCase.studentProfile;
    setTestCaseEditDraft({
      id: testCase.id,
      name: testCase.name,
      purposeLabel: testCase.purposeLabel,
      scenarioSummary: testCase.scenarioSummary,
      label: profile?.label ?? "",
      gradeLevel: profile?.gradeLevel ?? "",
      knowledgeLevel: profile?.knowledgeLevel ?? "",
      personality: profile?.personality ?? "",
    });
  }

  function collapseStudentDetail(testCaseId: string) {
    setExpandedStudentDetailIds((prev) => {
      const next = new Set(prev);
      next.delete(testCaseId);
      return next;
    });
  }

  function saveTestCaseEdit() {
    if (!testCaseEditDraft) return;
    const d = testCaseEditDraft;
    const target = testCases.find((t) => t.id === d.id);
    if (!target) {
      setTestCaseEditDraft(null);
      return;
    }

    const finalPrompt = resolveAssistantSystemPrompt({
      promptMarkdown,
      appId,
      serverSystemPrompt,
    }).trim();

    const nextScript: TestCasePreset = {
      ...target.script,
      purposeLabel: d.purposeLabel.trim() || target.script.purposeLabel,
      scenarioSummary:
        d.scenarioSummary.trim() || target.script.scenarioSummary,
    };
    const nextProfile: StudentProfile | null = target.studentProfile
      ? {
          ...target.studentProfile,
          label: d.label.trim() || target.studentProfile.label,
          gradeLevel: d.gradeLevel.trim() || target.studentProfile.gradeLevel,
          knowledgeLevel:
            d.knowledgeLevel.trim() || target.studentProfile.knowledgeLevel,
          personality:
            d.personality.trim() || target.studentProfile.personality,
        }
      : d.label.trim()
        ? {
            id: `custom-${target.id}`,
            label: d.label.trim(),
            gradeLevel: d.gradeLevel.trim() || "—",
            knowledgeLevel: d.knowledgeLevel.trim() || "—",
            personality: d.personality.trim() || "—",
          }
        : null;

    const pendingConfigureGen = Boolean(
      target.autoDialoguePending && target.teacherEntry === "configure",
    );

    const scriptedReady: TestCaseSet | null = pendingConfigureGen
      ? {
          ...target,
          name: d.name.trim() || target.name,
          purposeLabel: nextScript.purposeLabel,
          scenarioSummary: nextScript.scenarioSummary,
          script: nextScript,
          studentProfile: nextProfile,
          warmStart: "scripted",
          teacherEntry: undefined,
          autoDialoguePending: false,
          messages: finalPrompt
            ? []
            : [
                createMessage(
                  "assistant",
                  `Add your **Final Prompt** in the instruction panel on the left, then click **Apply current prompt** there. That saves the prompt and generates the simulated student conversation in this testcase.`,
                ),
              ],
          simulatedUserTurns: undefined,
          visualizationState: null,
          passed: false,
          verificationStatus: "idle",
          verificationNote: "",
        }
      : null;

    setTestCases((current) =>
      current.map((tc) => {
        if (tc.id !== d.id) return tc;

        const base = {
          ...tc,
          name: d.name.trim() || tc.name,
          purposeLabel: nextScript.purposeLabel,
          scenarioSummary: nextScript.scenarioSummary,
          script: nextScript,
          studentProfile: nextProfile,
          visualizationState: null,
          passed: false,
          verificationStatus: "idle" as const,
          verificationNote: "",
        };

        if (
          scriptedReady &&
          tc.autoDialoguePending &&
          tc.teacherEntry === "configure"
        ) {
          return scriptedReady;
        }

        return {
          ...base,
          messages:
            tc.warmStart === "teacher"
              ? getTeacherLedContextSeedMessages(
                  displayName,
                  nextProfile,
                  nextScript,
                  readOnly,
                )
              : tc.warmStart === "scripted"
                ? tc.messages
                : getInitialMessages(
                    displayName,
                    nextProfile,
                    nextScript,
                    readOnly,
                  ),
        };
      }),
    );

    setTestCaseEditDraft(null);

    if (
      scriptedReady &&
      finalPrompt &&
      isAssistedBehaviorEnabled(assistedAuthoringMode)
    ) {
      void (async () => {
        try {
          await fetchAndApplyScriptedDialogues([scriptedReady]);
          setApplyError("");
          setApplySummary(
            "Generated simulated chat preview for this test case.",
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setApplyError(msg);
          setTestCases((current) =>
            current.map((tc) => {
              if (tc.id !== scriptedReady.id) return tc;
              if (tc.messages.length > 0) return tc;
              return {
                ...tc,
                messages: [
                  createMessage(
                    "assistant",
                    `Could not generate simulated dialogue (${msg}). Check your API key, confirm the Final Prompt is saved, or click **Apply current prompt** in the instruction panel to try again.`,
                  ),
                ],
              };
            }),
          );
        }
      })();
    }
  }

  function deleteTestCase(testCaseId: string) {
    if (testCases.length <= 1) return;

    setExpandedStudentDetailIds((prev) => {
      const next = new Set(prev);
      next.delete(testCaseId);
      return next;
    });
    setTestCases((current) =>
      current.filter((testCase) => testCase.id !== testCaseId),
    );
    if (activeTestCaseId === testCaseId) {
      const fallback = testCases.find((testCase) => testCase.id !== testCaseId);
      setActiveTestCaseId(fallback?.id || "");
    }
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setEditingMessageId(null);
    setEditingDraft("");
    clearPromptUpdateState();
  }

  function selectTestCase(testCaseId: string) {
    setActiveTestCaseId(testCaseId);
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setEditingMessageId(null);
    setEditingDraft("");
    setApplyError("");
    setApplySummary("");
    setPipelineResult(null);
  }

  function toggleActiveTestCasePassed() {
    if (!activeTestCase) return;
    updateTestCaseById(activeTestCase.id, (testCase) => ({
      ...testCase,
      passed: !testCase.passed,
    }));
  }

  function startEditingMessage(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditingDraft(message.content);
    setApplyError("");
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingDraft("");
  }

  async function saveEditedMessage(messageId: string) {
    const nextContent = editingDraft.trim();
    if (!nextContent || !activeTestCase) return;

    const targetIndex = activeTestCase.messages.findIndex(
      (message) => message.id === messageId,
    );
    if (targetIndex < 0) return;

    const targetMessage = activeTestCase.messages[targetIndex];
    const currentPrompt = resolveAssistantSystemPrompt({
      promptMarkdown,
      appId,
      serverSystemPrompt,
    });
    const updatedTargetMessage = {
      ...targetMessage,
      content: nextContent,
    };
    const preservedPrefix = [
      ...activeTestCase.messages.slice(0, targetIndex),
      updatedTargetMessage,
    ];
    const trailingUserMessages = activeTestCase.messages
      .slice(targetIndex + 1)
      .filter((message) => message.role === "user");

    updateTestCaseById(activeTestCase.id, (testCase) => ({
      ...testCase,
      messages: preservedPrefix,
      visualizationState: null,
      verificationStatus: "idle",
      verificationNote: "",
    }));
    cancelEditingMessage();
    clearPromptUpdateState(true);
    const workEpoch = ++assistedWorkEpochRef.current;
    setBusy(true);
    setBatchRunProgress({
      title: "Updating current testcase",
      detail: "Regenerating the following conversation...",
    });

    try {
      let regeneratedMessages = [...preservedPrefix];

      const needsImmediateAssistantReply =
        updatedTargetMessage.role === "user" &&
        regeneratedMessages[regeneratedMessages.length - 1]?.role === "user";

      if (needsImmediateAssistantReply) {
        if (assistedWorkEpochRef.current !== workEpoch) return;
        setBatchRunProgress({
          title: "Updating current testcase",
          detail: "Generating the next reply...",
        });
        const reply = await requestPreviewReply({
          system: buildCaseSpecificPrompt(
            currentPrompt,
            activeTestCase.studentProfile,
          ),
          messages: regeneratedMessages,
          visualizationState: null,
        });
        if (assistedWorkEpochRef.current !== workEpoch) return;
        regeneratedMessages = [
          ...regeneratedMessages,
          createMessage("assistant", reply),
        ];
      }

      for (const [index, userMessage] of trailingUserMessages.entries()) {
        if (assistedWorkEpochRef.current !== workEpoch) return;
        setBatchRunProgress({
          title: "Updating current testcase",
          detail: `Regenerating follow-up ${index + 1} of ${trailingUserMessages.length}...`,
        });
        regeneratedMessages = [...regeneratedMessages, userMessage];
        const reply = await requestPreviewReply({
          system: buildCaseSpecificPrompt(
            currentPrompt,
            activeTestCase.studentProfile,
          ),
          messages: regeneratedMessages,
          visualizationState: null,
        });
        if (assistedWorkEpochRef.current !== workEpoch) return;
        regeneratedMessages = [
          ...regeneratedMessages,
          createMessage("assistant", reply),
        ];
      }

      if (assistedWorkEpochRef.current !== workEpoch) return;
      updateTestCaseById(activeTestCase.id, (testCase) => ({
        ...testCase,
        messages: regeneratedMessages,
        visualizationState: null,
        verificationStatus: "idle",
        verificationNote: "",
      }));
      setApplySummary(
        "Updated this bubble and regenerated the rest of the conversation.",
      );
    } catch (error: any) {
      if (assistedWorkEpochRef.current !== workEpoch) return;
      updateTestCaseById(activeTestCase.id, (testCase) => ({
        ...testCase,
        messages: [
          ...preservedPrefix,
          createMessage(
            "assistant",
            `Sorry—something went wrong: ${error?.message || error}`,
          ),
        ],
        visualizationState: null,
        verificationStatus: "idle",
        verificationNote: "",
      }));
      setApplyError(
        error?.message || "Failed to regenerate the follow-up conversation.",
      );
    } finally {
      if (assistedWorkEpochRef.current === workEpoch) {
        setBatchRunProgress(null);
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    void loadApp();
  }, [appId, appVersion]);

  // Only reset when the app identity or read-only mode changes. Do not depend on
  // `appName` (loads after mount and would replace all case IDs) or `appVersion`
  // (bumps on settings save)—those would invalidate in-flight dialogue generation
  // and leave scripted cases with empty messages forever.
  // Do not run on the first mount: `useState(createInitialTestCases)` already
  // created stable IDs; an immediate resetSession would issue new UUIDs and race
  // the dialogue generator (API results would not match current case ids).
  useEffect(() => {
    const prev = prevSessionResetKeyRef.current;
    prevSessionResetKeyRef.current = { appId, readOnly };
    if (!prev) return;
    if (prev.appId === appId && prev.readOnly === readOnly) return;
    resetSession();
  }, [appId, readOnly]);

  useEffect(() => {
    didBootstrapSimulatedDialogueRef.current = false;
  }, [appId]);

  useEffect(() => {
    if (readOnly) return;
    if (didBootstrapSimulatedDialogueRef.current) return;
    if (!isAssistedBehaviorEnabled(assistedAuthoringMode)) return;

    const base = resolveAssistantSystemPrompt({
      promptMarkdown,
      appId,
      serverSystemPrompt,
    }).trim();
    if (!base) return;
    if (base.trim() === ASSISTANT_PANEL_DEFAULT_SYSTEM_PROMPT.trim()) return;

    const scriptedEmpty = testCases.filter(
      (tc) =>
        tc.warmStart === "scripted" &&
        tc.messages.length === 0 &&
        tc.studentProfile,
    );
    if (!scriptedEmpty.length) return;

    didBootstrapSimulatedDialogueRef.current = true;
    void (async () => {
      try {
        await fetchAndApplyScriptedDialogues(scriptedEmpty);
        setApplyError("");
        setApplySummary(
          "Simulated student conversations are ready for your test cases.",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setApplyError(msg);
        setTestCases((current) =>
          current.map((tc) => {
            if (tc.warmStart !== "scripted" || tc.messages.length > 0)
              return tc;
            return {
              ...tc,
              messages: [
                createMessage(
                  "assistant",
                  `Could not auto-generate simulated dialogue (${msg}). Check the API key in settings, or click **Apply current prompt** in the Final Prompt panel to try again.`,
                ),
              ],
            };
          }),
        );
      }
    })();
  }, [
    readOnly,
    appId,
    assistedAuthoringMode,
    promptMarkdown,
    serverSystemPrompt,
    testCases,
    fetchAndApplyScriptedDialogues,
  ]);

  // Mode panel bootstrap: enter try-chat (ON→OFF) or regenerate assisted suite (OFF→ON).
  useEffect(() => {
    if (!modePanelBootstrapAction) return;
    if (readOnly) return;

    const actionId = JSON.stringify(modePanelBootstrapAction);
    if (modePanelBootstrapInProgressRef.current === actionId) return;
    modePanelBootstrapInProgressRef.current = actionId;

    const action = modePanelBootstrapAction.action;

    if (action === "enter-try-chat") {
      applyTryChatSession();
      setApplySummary(
        "Assisted test cases discarded. Try your bot in this chat.",
      );
      onModePanelBootstrapComplete?.();
      modePanelBootstrapInProgressRef.current = null;
      return;
    }

    if (action === "regenerate") {
      if (!isAssistedBehaviorEnabled(assistedAuthoringMode)) {
        onModePanelBootstrapComplete?.();
        modePanelBootstrapInProgressRef.current = null;
        return;
      }

      const base = resolveAssistantSystemPrompt({
        promptMarkdown,
        appId,
        serverSystemPrompt,
      }).trim();

      // Always replace try-chat / prior state with a fresh assisted suite.
      const initialCases = createInitialTestCases(displayName, readOnly);
      const scriptedCases = initialCases.filter(
        (tc) => tc.warmStart === "scripted" && tc.studentProfile,
      );
      setTestCases(
        scriptedCases.map((tc) => ({
          ...tc,
          messages: [],
        })),
      );
      setActiveTestCaseId(scriptedCases[0]?.id || "");
      setExpandedStudentDetailIds(new Set());

      if (!base) {
        onOffToOnError?.(
          "Cannot regenerate test cases without a Final Prompt. Please add a prompt on the left.",
        );
        onModePanelBootstrapComplete?.();
        modePanelBootstrapInProgressRef.current = null;
        return;
      }

      if (!scriptedCases.length) {
        onModePanelBootstrapComplete?.();
        modePanelBootstrapInProgressRef.current = null;
        return;
      }

      void (async () => {
        try {
          await fetchAndApplyScriptedDialogues(scriptedCases);
          setApplyError("");
          setApplySummary("Generated test cases with current Final Prompt.");
          onModePanelBootstrapComplete?.();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onOffToOnError?.(
            `Failed to regenerate test cases: ${msg}. Check your API key or Final Prompt.`,
          );
          setTestCases((current) =>
            current.map((tc) => {
              if (tc.warmStart !== "scripted") return tc;
              return {
                ...tc,
                messages: [
                  createMessage(
                    "assistant",
                    `Could not regenerate simulated dialogue (${msg}). Check the API key in settings or the Final Prompt.`,
                  ),
                ],
              };
            }),
          );
          onModePanelBootstrapComplete?.();
        } finally {
          modePanelBootstrapInProgressRef.current = null;
        }
      })();
    }
  }, [
    modePanelBootstrapAction,
    readOnly,
    assistedAuthoringMode,
    appId,
    displayName,
    promptMarkdown,
    serverSystemPrompt,
    fetchAndApplyScriptedDialogues,
    onModePanelBootstrapComplete,
    onOffToOnError,
  ]);

  useEffect(() => {
    if (!testCases.length) return;
    if (
      activeTestCaseId &&
      testCases.some((testCase) => testCase.id === activeTestCaseId)
    ) {
      return;
    }
    setActiveTestCaseId(testCases[0].id);
  }, [activeTestCaseId, testCases]);

  useEffect(() => {
    const chatLayoutKey = testCases
      .map((tc) => `${tc.id}:${tc.messages.length}`)
      .join("|");
    onTestCaseStatusChange?.({
      totalCount: testCases.length,
      passedCount: passedCaseCount,
      allPassed: testCases.length > 0 && passedCaseCount === testCases.length,
      chatLayoutKey,
    });
  }, [onTestCaseStatusChange, passedCaseCount, testCases]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    if (readOnly) {
      setPromptMarkdown(promptOverride || "");
      return;
    }

    if (typeof window === "undefined") return;

    const syncPrompt = () => {
      setPromptMarkdown(readStoredPrompt(appId));
    };

    const onPromptUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        appId?: string;
        markdown?: string;
        applyToAllTestCases?: boolean;
      }>;
      if (customEvent.detail?.appId && customEvent.detail.appId !== appId)
        return;
      const nextPrompt = customEvent.detail?.markdown || "";
      setPromptMarkdown(nextPrompt);
      if (
        customEvent.detail?.applyToAllTestCases &&
        nextPrompt.trim() &&
        isAssistedBehaviorEnabled(assistedAuthoringMode)
      ) {
        setComposerError("");
        setApplyError("");
        flushSync(() => {
          setTestCases((current) =>
            current.map((tc) =>
              tc.warmStart === "scripted"
                ? {
                    ...tc,
                    messages: [],
                    simulatedUserTurns: undefined,
                    visualizationState: null,
                    passed: false,
                    verificationStatus: "idle",
                    verificationNote: "",
                  }
                : tc,
            ),
          );
        });
        window.setTimeout(() => {
          const scripted = testCasesRef.current.filter(
            (tc) => tc.warmStart === "scripted",
          );
          if (!scripted.length) return;
          void (async () => {
            try {
              await fetchAndApplyScriptedDialogues(scripted, {
                systemPromptOverride: nextPrompt,
              });
              setApplyError("");
              setApplySummary(
                "Regenerated simulated chat previews for all scripted test cases.",
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setApplyError(msg);
              setTestCases((current) =>
                current.map((tc) => {
                  if (tc.warmStart !== "scripted") return tc;
                  if (tc.messages.length > 0) return tc;
                  return {
                    ...tc,
                    messages: [
                      createMessage(
                        "assistant",
                        `Could not generate simulated dialogue (${msg}). Check your API key or try **Apply current prompt** again.`,
                      ),
                    ],
                  };
                }),
              );
            }
          })();
        }, 0);
      }
    };

    syncPrompt();
    window.addEventListener("instruction-doc-updated", onPromptUpdate);
    window.addEventListener("focus", syncPrompt);

    return () => {
      window.removeEventListener("instruction-doc-updated", onPromptUpdate);
      window.removeEventListener("focus", syncPrompt);
    };
  }, [
    appId,
    promptOverride,
    readOnly,
    fetchAndApplyScriptedDialogues,
    assistedAuthoringMode,
  ]);

  async function send(textOverride?: string) {
    const baseText = (textOverride ?? input).trim();
    const text =
      attachedFileText && !attachedImageUrl
        ? [baseText, attachedFileText].filter(Boolean).join("\n\n")
        : baseText;
    const userContent =
      text.trim() || (attachedImageUrl ? "(See attached image.)" : "");
    if (
      (!userContent.trim() && !attachedImageUrl) ||
      busy ||
      applyBusy ||
      !activeTestCase
    ) {
      return;
    }
    const currentTestCaseId = activeTestCase.id;
    const currentVisualizationState = activeTestCase.visualizationState;

    const nextMessages = [
      ...messages,
      createMessage(
        "user",
        userContent,
        userContent,
        attachedImageUrl || undefined,
      ),
    ];

    setComposerError("");
    clearPromptUpdateState(true);
    cancelEditingMessage();
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    updateTestCaseById(currentTestCaseId, (testCase) => ({
      ...testCase,
      messages: nextMessages,
      verificationStatus: "idle",
      verificationNote: "",
    }));
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appId,
          system: buildCaseSpecificPrompt(
            resolveAssistantSystemPrompt({
              promptMarkdown,
              appId,
              serverSystemPrompt,
            }),
            activeStudentProfile,
          ),
          messages: nextMessages,
          visualizationState: currentVisualizationState,
          recording: editorTestRecording.buildPayload(
            currentTestCaseId,
            nextMessages,
          ),
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json");
      const body = isJSON ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = isJSON
          ? body?.error || body?.message || "Server error"
          : String(body).slice(0, 400);

        throw new Error(msg);
      }

      const reply = isJSON ? (body?.reply ?? "") : String(body);

      updateTestCaseById(currentTestCaseId, (testCase) => ({
        ...testCase,
        messages: [...testCase.messages, createMessage("assistant", reply)],
        verificationStatus: "idle",
        verificationNote: "",
      }));

      if (isJSON && body?.provider && body?.model) {
        setModelLabel(`${body.provider} · ${body.model}`);
      }
    } catch (e: any) {
      updateTestCaseById(currentTestCaseId, (testCase) => ({
        ...testCase,
        messages: [
          ...testCase.messages,
          createMessage(
            "assistant",
            `Sorry—something went wrong: ${e?.message || e}`,
          ),
        ],
        verificationStatus: "idle",
        verificationNote: "",
      }));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function toggleVoiceInput() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setComposerError("Voice input is not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setComposerError("");
      setListening(true);
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || "")
        .join(" ");
      setInput(transcript.trim());
    };
    recognition.onerror = () => {
      setComposerError("Voice input failed. Please try again.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  async function runPromptUpdatePipeline() {
    if (!isAssistedBehaviorEnabled(assistedAuthoringMode)) return;
    if (!editedMessageCount || busy || applyBusy || !activeTestCase) return;

    const currentPrompt = resolveAssistantSystemPrompt({
      promptMarkdown,
      appId,
      serverSystemPrompt,
    });
    if (!currentPrompt.trim()) {
      setApplyError(
        "The current prompt is empty, so there is nothing to update yet.",
      );
      return;
    }

    setApplyBusy(true);
    setApplyError("");
    setApplySummary("");

    try {
      const res = await fetch("/api/prompt-builder/chat-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          currentPrompt,
          originalMessages: messages.map(({ id, role, originalContent }) => ({
            id,
            role,
            content: originalContent,
          })),
          editedMessages: messages.map(({ id, role, content }) => ({
            id,
            role,
            content,
          })),
          verificationCases: testCases.map((testCase) => ({
            id: testCase.id,
            name: testCase.name,
            studentProfile: testCase.studentProfile,
            messages: testCase.messages.map(({ id, role, content }) => ({
              id,
              role,
              content,
            })),
          })),
          activeCaseId: activeTestCase.id,
          activeCaseName: activeTestCase.name,
          activeCaseStudentProfile: activeStudentProfile,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body?.error || "Failed to run the prompt update pipeline.",
        );
      }

      const result: PromptUpdateResult = {
        diffAnalysis: body?.diffAnalysis || {
          teacherIntent: "",
          keyDifferences: [],
          desiredBehaviors: [],
          guardrailsToKeep: [],
          successCriteria: [],
        },
        promptPlan: body?.promptPlan || {
          targetSections: [],
          rewriteInstructions: [],
          preserveSections: [],
          rationale: "",
        },
        candidatePrompt: body?.candidatePrompt || "",
        updatedPrompt: body?.updatedPrompt || body?.candidatePrompt || "",
        changedBlocks: Array.isArray(body?.changedBlocks)
          ? body.changedBlocks
          : [],
        verification: {
          currentCase: body?.verification?.currentCase || null,
          otherCaseChecks: Array.isArray(body?.verification?.otherCaseChecks)
            ? body.verification.otherCaseChecks
            : [],
          regressions: Array.isArray(body?.verification?.regressions)
            ? body.verification.regressions
            : [],
          summary: body?.verification?.summary || "",
          shouldApply: Boolean(body?.verification?.shouldApply),
        },
      };

      if (!result.candidatePrompt.trim()) {
        throw new Error(
          "The prompt update pipeline did not return a candidate prompt.",
        );
      }

      setPipelineResult(result);
      setTestCases((current) =>
        current.map((testCase) => {
          const match =
            (result.verification.currentCase &&
              result.verification.currentCase.testCaseId === testCase.id &&
              result.verification.currentCase) ||
            result.verification.otherCaseChecks.find(
              (check) => check.testCaseId === testCase.id,
            );

          return {
            ...testCase,
            verificationStatus: match?.status || "idle",
            verificationNote: match?.note || "",
          };
        }),
      );
      window.dispatchEvent(
        new CustomEvent<PromptFeedbackEventDetail>("prompt-feedback-applied", {
          detail: {
            updatedPrompt: result.updatedPrompt || result.candidatePrompt,
            changedBlocks: result.changedBlocks,
            summary:
              result.verification.summary ||
              "Updated the prompt from this chat.",
          },
        }),
      );
      setApplySummary(
        result.verification.summary || "Updated the prompt from this chat.",
      );
    } catch (error: any) {
      setApplyError(
        error?.message || "Failed to run the prompt update pipeline.",
      );
    } finally {
      setApplyBusy(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readImageDataUrl(file);
        setAttachedImageName(file.name);
        setAttachedImageUrl(dataUrl);
        setAttachedFileName("");
        setAttachedFileText("");
      } else {
        const attachmentText = await buildFileAttachmentText(file);
        setAttachedFileName(file.name);
        setAttachedFileText(attachmentText);
        setAttachedImageName("");
        setAttachedImageUrl("");
      }
      setComposerError("");
    } catch (error: any) {
      setComposerError(error?.message || "Could not read that file.");
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <aside
        key={activeTestCase?.id || "preview"}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border-2 border-rose-100 bg-white shadow-[0_14px_40px_rgba(251,113,133,0.10)] dark:border dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none"
      >
        {!readOnly && !assistedOn && (
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-700 dark:text-zinc-200">
                  Try your bot
                </div>
              </div>
              <button
                type="button"
                onClick={clearTryConversation}
                disabled={busy || applyBusy}
                className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-700"
              >
                Clear conversation
              </button>
            </div>
          </div>
        )}
        {!readOnly && assistedOn && (
          <div className="shrink-0 overflow-hidden bg-white dark:bg-zinc-950">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-700 dark:text-zinc-200">
                    Testcase
                  </div>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
                    {testCases.length}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200">
                    {passedCaseCount} passed
                  </span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-200">
                    {verifiedCaseCount} verified
                  </span>
                  {(warningCaseCount > 0 || failedCaseCount > 0) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/70 dark:text-amber-200">
                      {warningCaseCount + failedCaseCount} needs review
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-2.5">
              {testCases.map((testCase, index) => {
                const active = testCase.id === activeTestCase?.id;
                const studentDetailOpen =
                  Boolean(testCase.studentProfile) &&
                  expandedStudentDetailIds.has(testCase.id);
                return (
                  <div
                    key={testCase.id}
                    ref={
                      index === 0
                        ? spotlightTargetRefs?.case0
                        : index === 1
                          ? spotlightTargetRefs?.case1
                          : undefined
                    }
                    className="flex min-w-[200px] max-w-[280px] flex-col gap-2"
                  >
                    <div
                      className={[
                        "rounded-xl border px-3 py-2 text-left transition",
                        testCase.passed
                          ? active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/80 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                          : active
                            ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700/80",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => selectTestCase(testCase.id)}
                          disabled={busy || applyBusy}
                          className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400">
                            Case {index + 1}
                          </div>
                          <div
                            className={[
                              "mt-1 text-sm font-medium",
                              testCase.passed
                                ? "text-emerald-700 dark:text-emerald-300"
                                : active
                                  ? "text-rose-700 dark:text-rose-300"
                                  : "text-slate-700 dark:text-zinc-200",
                            ].join(" ")}
                          >
                            {testCase.name}
                          </div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400">
                            {testCase.purposeLabel}
                          </div>
                        </button>
                        <div className="flex shrink-0 items-start gap-1">
                          <button
                            type="button"
                            onClick={() => openTestCaseEdit(testCase)}
                            disabled={busy || applyBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                            title="Edit test case"
                            aria-label="Edit test case"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path
                                d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-2.207 2.207L4 13.172V16h2.828l7.379-7.379-2.828-2.828z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTestCase(testCase.id)}
                            disabled={
                              busy || applyBusy || testCases.length <= 1
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                            title={
                              testCases.length <= 1
                                ? "Keep at least one test case"
                                : "Delete this test case"
                            }
                            aria-label={
                              testCases.length <= 1
                                ? "Keep at least one test case"
                                : "Delete this test case"
                            }
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path
                                d="M6.2 6.2a.75.75 0 011.06 0L10 8.94l2.74-2.74a.75.75 0 111.06 1.06L11.06 10l2.74 2.74a.75.75 0 11-1.06 1.06L10 11.06l-2.74 2.74a.75.75 0 11-1.06-1.06L8.94 10 6.2 7.26a.75.75 0 010-1.06z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    {studentDetailOpen && testCase.studentProfile && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-left dark:border-zinc-600 dark:bg-zinc-800/90">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                            {TEST_CASE_STUDENTS_SECTION_HEADING}
                          </div>
                          <button
                            type="button"
                            onClick={() => collapseStudentDetail(testCase.id)}
                            className="shrink-0 text-[10px] font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
                          >
                            Hide
                          </button>
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-snug text-slate-600 dark:text-zinc-300">
                          {formatStudentProfile(testCase.studentProfile)}
                        </pre>
                        <div className="mt-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600 dark:border-zinc-600 dark:text-zinc-300">
                          <span className="font-medium text-slate-700 dark:text-zinc-200">
                            Scenario:{" "}
                          </span>
                          {testCase.scenarioSummary}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                ref={spotlightTargetRefs?.addCase}
                type="button"
                onClick={() => setAddTestCaseChoiceOpen(true)}
                disabled={busy || applyBusy}
                className="min-w-[112px] rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
                title="Add a new test case"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400">
                  New case
                </div>
                <div className="mt-1 text-sm font-medium text-slate-700 dark:text-zinc-200">
                  Add test case
                </div>
              </button>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-100 bg-gradient-to-r from-amber-100 via-rose-100 to-sky-100 px-4 py-2.5 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-950 dark:text-zinc-50">
              {displayName}
              <span className="font-medium text-slate-600 dark:text-zinc-400">
                {" "}
                · {modelNameWithoutProvider(modelLabel)}
              </span>
            </h3>
          </div>

          {!readOnly && assistedOn && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                ref={spotlightTargetRefs?.markPass}
                className={[
                  "rounded-xl px-3 py-1 text-xs font-medium transition",
                  activeTestCase?.passed
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-900/10 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-700/40 dark:hover:bg-emerald-900/50",
                ].join(" ")}
                onClick={toggleActiveTestCasePassed}
                type="button"
              >
                {activeTestCase?.passed ? "Passed" : "Mark pass"}
              </button>
              <button
                className="rounded-xl p-1.5 text-slate-800 hover:bg-white/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
                title="Refresh"
                onClick={() => {
                  resetSession();
                  void loadApp();
                }}
              >
                <Icon d="M12 6V3L8 7l4 4V8a4 4 0 110 8 4 4 0 01-3.46-2H6.26A6 6 0 1012 6z" />
              </button>
            </div>
          )}
        </div>

        <div
          ref={spotlightTargetRefs?.simulatedChat}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-rose-100 bg-white/80 px-4 py-2 text-[11px] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {readOnly
              ? "Read-only shared preview."
              : assistedOn
                ? "Chat · edit bubbles · update prompt."
                : "Try chat · your messages use the Final Prompt on the left."}
          </div>

          <div
            ref={listRef}
            className="min-h-0 flex-1 space-y-4 overflow-auto bg-gradient-to-b from-white via-rose-50/30 to-sky-50/40 p-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950"
          >
            {assistedOn && (
              <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                {activeTestCase?.name || "Preview"} · {displayName}
              </div>
            )}
            {visualizationMode && visualizationMode !== "spacing-testing" && (
              <div
                className={[
                  "border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none",
                  visualFullscreen
                    ? "fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl"
                    : "rounded-2xl",
                ].join(" ")}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-700">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-300">
                      {visualFullscreen
                        ? "Fullscreen visualization"
                        : "Visualized element"}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-800 dark:text-zinc-100">
                      {getVisualizationTitle(
                        visualizationMode,
                        visualFullscreen,
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisualFullscreen((current) => !current)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {visualFullscreen ? "Close" : "Fullscreen"}
                  </button>
                </div>
                <div
                  className={
                    visualFullscreen
                      ? "flex-1 overflow-auto bg-slate-50 p-6 dark:bg-zinc-950"
                      : "p-4"
                  }
                >
                  <VisualizationSurface
                    mode={visualizationMode}
                    appId={appId}
                    latestUserMessage={latestUserMessage}
                    latestAssistantMessage={latestAssistantMessage}
                    assistantTurnCount={assistantTurnCount}
                    onStateChange={(nextState) =>
                      updateActiveTestCase((testCase) => ({
                        ...testCase,
                        visualizationState: nextState,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {messages.map((message) => {
              const isEditing = editingMessageId === message.id;
              const isEdited = messageHasEdits(message);

              return (
                <div
                  key={message.id}
                  className={[
                    "space-y-2",
                    message.role === "assistant" ? "mr-8" : "ml-8",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex items-center gap-3",
                      message.role === "assistant" ? "" : "justify-end",
                    ].join(" ")}
                  >
                    {message.role === "assistant" && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-100 text-sm">
                        🤖
                      </div>
                    )}
                    <div className="text-xs font-medium text-slate-500 dark:text-zinc-300">
                      {message.role === "assistant"
                        ? `${displayName} preview`
                        : assistedOn
                          ? "Test user"
                          : "You"}
                    </div>
                    {assistedOn && isEdited && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        Edited
                      </span>
                    )}
                    {message.role === "user" && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-100 text-sm">
                        🙂
                      </div>
                    )}
                  </div>

                  <div
                    className={[
                      "rounded-[1.4rem] border-2 px-4 py-3 text-[15px] leading-7 shadow-sm",
                      message.role === "assistant"
                        ? "border-rose-200 bg-white text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        : "border-sky-200 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100",
                    ].join(" ")}
                  >
                    {isEditing && assistedOn ? (
                      <div className="space-y-3">
                        <textarea
                          value={editingDraft}
                          onChange={(event) =>
                            setEditingDraft(event.target.value)
                          }
                          className="min-h-[132px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[15px] leading-7 text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
                          disabled={busy || applyBusy}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                            Save, then use Update prompt below.
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelEditingMessage}
                              className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEditedMessage(message.id)}
                              disabled={!editingDraft.trim()}
                              className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {message.role === "user" && message.imageUrl ? (
                          <img
                            src={message.imageUrl}
                            alt="Attached"
                            className="max-h-48 max-w-full rounded-xl border border-sky-300/80 object-contain dark:border-sky-700/60"
                          />
                        ) : null}
                        <ChatMessageBody
                          content={message.content}
                          className="text-[15px] leading-7 text-slate-800 dark:text-zinc-100"
                        />
                        {!readOnly && assistedOn && (
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => startEditingMessage(message)}
                              disabled={busy || applyBusy}
                              className="rounded-full border border-sky-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800/80 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-sky-700 dark:hover:bg-zinc-800"
                            >
                              Edit bubble
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {visualizationMode === "spacing-testing" && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-100 text-sm">
                    🤖
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-zinc-300">
                    {displayName} preview
                  </div>
                </div>
                <VisualizationSurface
                  mode={visualizationMode}
                  appId={appId}
                  latestUserMessage={latestUserMessage}
                  latestAssistantMessage={latestAssistantMessage}
                  assistantTurnCount={assistantTurnCount}
                  embedded={true}
                  onStateChange={(nextState) =>
                    updateActiveTestCase((testCase) => ({
                      ...testCase,
                      visualizationState: nextState,
                    }))
                  }
                />
              </div>
            )}

            {busy && (
              <div className="w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                Thinking...
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="border-t border-rose-100 bg-white/85 px-4 pb-4 pt-4 dark:border-zinc-800 dark:bg-zinc-950">
              {showApplyPromptStrip && (
                <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-3 dark:border-amber-900/60 dark:bg-amber-950/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Update prompt
                      </div>
                      <p className="mt-0.5 text-[11px] text-amber-800/95 dark:text-amber-100/90">
                        From edited bubbles.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pipelineResult?.verification.currentCase && (
                        <div className="rounded-full border border-amber-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-zinc-800/90 dark:text-amber-200">
                          Confidence{" "}
                          {pipelineResult.verification.currentCase.score}/100
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void runPromptUpdatePipeline()}
                        disabled={
                          !editedMessageCount ||
                          busy ||
                          applyBusy ||
                          Boolean(editingMessageId)
                        }
                        className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {applyBusy
                          ? "Updating..."
                          : `Update prompt${editedMessageCount ? ` (${editedMessageCount})` : ""}`}
                      </button>
                    </div>
                  </div>
                  {applySummary && (
                    <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                      {applySummary}
                    </p>
                  )}
                  {applyError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {applyError}
                    </p>
                  )}
                  {editingMessageId && (
                    <p className="mt-2 text-[11px] text-slate-600 dark:text-zinc-400">
                      Finish bubble edit first.
                    </p>
                  )}
                </div>
              )}
              {!showApplyPromptStrip && applySummary && (
                <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-400">
                  {applySummary}
                </p>
              )}
              {!showApplyPromptStrip && applyError && (
                <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                  {applyError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 text-sm font-medium text-slate-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-zinc-200 dark:hover:bg-amber-950/60"
                  title="Upload file or image"
                  type="button"
                  disabled={busy || applyBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span aria-hidden="true">📃</span>
                </button>
                <button
                  className={[
                    "rounded-2xl border-2 p-2 disabled:opacity-50",
                    listening
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                      : "border-violet-200 bg-violet-50 text-slate-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-zinc-200 dark:hover:bg-violet-950/60",
                  ].join(" ")}
                  title={listening ? "Stop voice input" : "Start voice input"}
                  type="button"
                  disabled={busy || applyBusy}
                  onClick={toggleVoiceInput}
                >
                  <span aria-hidden="true">🎙️</span>
                </button>
                <input
                  className="h-11 flex-1 rounded-2xl border-2 border-rose-200 bg-white px-4 text-slate-800 placeholder:text-slate-400 dark:border-rose-900/60 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  placeholder={
                    listening ? "Listening…" : "Message, voice, file, or image"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={busy || applyBusy}
                />
                <button
                  className="h-11 rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-5 font-medium text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                  onClick={() => void send()}
                  disabled={busy || applyBusy}
                  type="button"
                >
                  Send
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={CHAT_ATTACHMENT_ACCEPT}
                onChange={handleFileChange}
              />
              {attachedFileName && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                    Attached: {attachedFileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedFileName("");
                      setAttachedFileText("");
                    }}
                    className="text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Remove
                  </button>
                </div>
              )}
              {attachedImageName && attachedImageUrl && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-zinc-400">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                    Image: {attachedImageName}
                  </span>
                  <img
                    src={attachedImageUrl}
                    alt=""
                    className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedImageName("");
                      setAttachedImageUrl("");
                    }}
                    className="text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Remove
                  </button>
                </div>
              )}
              {composerError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {composerError}
                </p>
              )}
            </div>
          )}
        </div>

        {visualizationMode &&
          visualizationMode !== "spacing-testing" &&
          visualFullscreen && (
            <div
              className="fixed inset-0 z-40 bg-slate-900/45"
              onClick={() => setVisualFullscreen(false)}
            />
          )}
        {panelBlockingProgress && !readOnly && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 backdrop-blur-[2px] dark:bg-zinc-950/70">
            <div className="w-full max-w-xs rounded-3xl border border-slate-200 bg-white px-5 py-4 text-center shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 animate-spin"
                  aria-hidden="true"
                >
                  <path
                    d="M12 4a8 8 0 018 8h-2a6 6 0 10-6 6v2a8 8 0 010-16z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                {panelBlockingProgress.title}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                {panelBlockingProgress.detail}
              </div>
            </div>
          </div>
        )}
      </aside>

      {addTestCaseChoiceOpen && !readOnly && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-test-case-choice-title"
          onClick={() => setAddTestCaseChoiceOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="add-test-case-choice-title"
              className="text-sm font-semibold text-slate-900 dark:text-zinc-100"
            >
              New test case
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              No auto-filled script—pick a start.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => confirmAddTestCase("configure")}
                disabled={busy || applyBusy}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <div className="font-semibold text-slate-900 dark:text-zinc-100">
                  Simulated student first
                </div>
                <div className="mt-1 text-[11px] font-normal text-slate-600 dark:text-zinc-400">
                  Edit student & scenario, then click **Apply current prompt**
                  to generate a 5-turn preview.
                </div>
              </button>
              <button
                type="button"
                onClick={() => confirmAddTestCase("scratch")}
                disabled={busy || applyBusy}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <div className="font-semibold text-slate-900 dark:text-zinc-100">
                  From scratch
                </div>
                <div className="mt-1 text-[11px] font-normal text-slate-600 dark:text-zinc-400">
                  Greeting only; you type turns.
                </div>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setAddTestCaseChoiceOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {testCaseEditDraft && !readOnly && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-case-edit-title"
          onClick={() => setTestCaseEditDraft(null)}
        >
          <div
            className="max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="test-case-edit-title"
              className="text-sm font-semibold text-slate-900 dark:text-zinc-100"
            >
              Edit test case
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              Saving refreshes this case&apos;s preview chat.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Case name
                <input
                  type="text"
                  value={testCaseEditDraft.name}
                  onChange={(event) =>
                    setTestCaseEditDraft((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Case type
                <input
                  type="text"
                  value={testCaseEditDraft.purposeLabel}
                  onChange={(event) =>
                    setTestCaseEditDraft((current) =>
                      current
                        ? { ...current, purposeLabel: event.target.value }
                        : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                  placeholder="e.g. Expected path, Edge case"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Scenario summary
                <textarea
                  value={testCaseEditDraft.scenarioSummary}
                  onChange={(event) =>
                    setTestCaseEditDraft((current) =>
                      current
                        ? { ...current, scenarioSummary: event.target.value }
                        : current,
                    )
                  }
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                />
              </label>
              <div className="border-t border-slate-100 pt-3 dark:border-zinc-700">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                  {TEST_CASE_STUDENTS_SECTION_HEADING}
                </div>
                <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Student label
                  <input
                    type="text"
                    value={testCaseEditDraft.label}
                    onChange={(event) =>
                      setTestCaseEditDraft((current) =>
                        current
                          ? { ...current, label: event.target.value }
                          : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                  />
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Grade level
                  <input
                    type="text"
                    value={testCaseEditDraft.gradeLevel}
                    onChange={(event) =>
                      setTestCaseEditDraft((current) =>
                        current
                          ? { ...current, gradeLevel: event.target.value }
                          : current,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                  />
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Knowledge level
                  <textarea
                    value={testCaseEditDraft.knowledgeLevel}
                    onChange={(event) =>
                      setTestCaseEditDraft((current) =>
                        current
                          ? { ...current, knowledgeLevel: event.target.value }
                          : current,
                      )
                    }
                    rows={2}
                    className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                  />
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Personality
                  <textarea
                    value={testCaseEditDraft.personality}
                    onChange={(event) =>
                      setTestCaseEditDraft((current) =>
                        current
                          ? { ...current, personality: event.target.value }
                          : current,
                      )
                    }
                    rows={2}
                    className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-rose-500 dark:focus:ring-rose-950/40"
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTestCaseEditDraft(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTestCaseEdit}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-medium text-white hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
