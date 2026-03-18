'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import '@mdxeditor/editor/style.css';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import {
  MDXEditor,
  toolbarPlugin,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  quotePlugin,
  codeBlockPlugin,
  markdownShortcutPlugin,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ListsToggle,
  CodeToggle,
  CreateLink,
  UndoRedo,
  Separator
} from '@mdxeditor/editor';
import type { PromptBuilderState } from '@/lib/app-store/types';

function AgentIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a1 1 0 011 1v1.08A7 7 0 0119 11v5a3 3 0 01-3 3h-1.14l1.1 2.2a1 1 0 11-1.8.9L13 19H11l-1.16 3.1a1 1 0 11-1.88-.68L9.14 19H8a3 3 0 01-3-3v-5a7 7 0 016-6.92V3a1 1 0 011-1zm-4 9a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm5 0a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm-3.75 4a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5z"
      />
    </svg>
  );
}

function StepIcon({
  d,
  className = 'h-4 w-4',
}: {
  d: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

/* ---------- Templates (from screenshots) ---------- */
const TEMPLATES: Record<string, string> = {
  '— Select a template —': '',

  // === Screenshot 1: Appendix items ===
  'Generating Worked Example': `# Learners' Level
I'm a python beginner having trouble with debugging.

# Problem Context
The coding problem, my code, and output are as follows:
[problem description]  
[current code]  
[current output]

# Prompt
Can you act as an intro-level programming tutor and generate a **minimal-code worked example** of a *different* problem that still uses the **same underlying concept** (e.g., a for-loop over indices)? Please walk through the example step by step, and highlight common pitfalls a beginner might hit.

# Guardrails
- Do **not** give me the solution to my original problem.
`,

  'Generating Guiding Questions': `# Learners' Level
I'm a python beginner having trouble with debugging.

# Problem Context
The coding problem, my code, and output are as follows:
[problem description]  
[current code]  
[current output]

# Prompt
Act as an intro-level programming tutor and give me **3–4 step-by-step guiding questions**, each with **multiple-choice options** (A/B/C/D), to help me reason about the bug.

# Interaction Rules
- Ask **one question at a time** and wait for my answer.  
- After I answer, explain why the correct choice is correct before moving on.

# Guardrails
- Do **not** give me the final code.
`,

  'Generating In-Context Explanation': `# Learners' Level
I'm a python beginner having trouble understanding the problem context.

# Problem Context
Explain how the **input** becomes the **output** for this problem using small, concrete examples.

# Prompt
Provide **two tiny input–output pairs**, then narrate the transformation *in order* (what the code would do at each step). End with a short checklist of what a correct solution must do.

# Guardrails
- Do **not** give me the solution code.
`,

  // === Screenshot 2: Learning Sciences principles ===
  'Spacing & Testing (Memory & Fluency)': `# Learning Principle: Spacing & Testing
Design a short **foreign-language vocabulary practice flow** that uses spaced review and quick retrieval checks.

## Instructions
- Always include a simple **flip-style flashcard deck** for vocabulary.
- Show **one word card at a time** and use the chat turns to alternate between prompting recall and revealing/checking the answer.
- Revisit harder words sooner and easier words later, so the deck reflects **spacing & testing**.
- Ask the learner to recall meaning, pronunciation, usage, or translation before revealing the answer.

## Guardrails
- Keep prompts minimal and focused.
- Do not dump the whole vocabulary list at once.
`,

  'Optimized Scheduling (Practice Selection)': `# Learning Principle: Optimized Scheduling
Given a learner’s prior outcomes (e.g., struggled with off-by-one), propose **5 practice items** ordered from easiest to hardest that **target the likely misconception**.

## For each item, include:
- Why this item targets the misconception
- The single thing they should check or print to verify understanding

## Guardrails
- No full code answers.
`,

  'Timely Feedback (Immediate, Specific)': `# Learning Principle: Timely Feedback
Create a **feedback rubric** for short debugging attempts.

## For each attempt, respond with:
- **What you observed** (objective)
- **One concrete check** to try next (print/log/trace)
- **Why** that check is informative

Keep feedback **short** and tied to the learner’s last action.
`,

  'Feature Focusing (What to Notice)': `# Learning Principle: Feature Focusing
Write a **noticing guide** for beginners debugging loops over indices.

## Include:
- 5 features to always scan (index start, end, step, length, mutation)
- 3 quick prints that reveal each feature’s value at runtime
- A tiny checklist to decide if the loop bound is correct

No full solutions.
`,

  'Worked Examples (Interleaved)': `# Learning Principle: Worked Examples (Interleaved)
Provide **two worked examples** and **one short practice** interleaved:
1) Example A: reading values by index  
2) Example B: writing values by index  
3) Practice: a tiny task mixing A & B

For each example, show **inputs**, the **state change** over two iterations, and the **final output**—but **no full code**.
`,

  'Prompted Self-Explanation': `# Learning Principle: Prompted Self-Explanation
After I share code or a step, prompt me to explain **why** I chose that step.

## Provide 4 prompts:
- Prediction: "Before running, what do you expect variable X to be on iteration k?"
- Contrast: "How is this different from iterating over values instead of indices?"
- Causality: "What line causes the incorrect output and why?"
- Repair: "What single change would align the state with your prediction?"

Do not provide code.
`,

  'Accountable Talk (Reasoning Moves)': `# Learning Principle: Accountable Talk
Use short **talk moves** that push for accurate reasoning:

- **Press for evidence:** "What output or print supports that claim?"
- **Revoice:** "So you’re saying the index starts at 1—did I get that right?"
- **Prompt for precision:** "Which variable exactly is off by one?"
- **Build on ideas:** "Given that, what would be the next diagnostic?"

Keep moves brief and targeted.
`,

  'Chemistry Virtual Lab Tutor': `# Background

You are an expert chemistry tutor supporting U.S. middle school chemistry lab learning.

You are talking to students who are learning how to reason through classroom-safe experiments, observations, variables, and safety decisions.

## Agent Configuration

- Mode: virtual lab coach
- Visualized element: always include an interactive virtual lab that is generated from a given chemical reaction equation, with clickable reagents, amount controls, and visible experimental effects
- Tools you can use: external simulation APIs, embedded widgets, diagram generation, or a custom-built reaction-based lab UI with clickable reagents and quantity controls
- Output style: short coaching turns with concrete observations, paired with an updated interactive lab state generated from the selected equation
- Safety rule: never encourage unsafe or physically dangerous lab actions

## Your Workflow

1. First, ask for the chemical reaction equation or let the student choose from default classroom examples, using age-appropriate U.S. middle school chemistry language.
2. Then, generate or update an interactive lab setup showing the required reagents, amount options, apparatus, and observable outcomes for that equation.
3. Next, ask the student to predict what will happen before they click to add or mix reagents in the generated lab.
4. After each interaction, explain the chemistry behind the observed effect and connect it to the target concept.

## Guidelines & Guardrails

- Use simple, concrete chemistry language before introducing formal terminology.
- Emphasize cause-and-effect between variables, observations, and conclusions.
- Include safety reminders whenever the scenario involves heat, glassware, chemicals, or pressure, but keep all suggested experiments classroom-safe and age-appropriate.
- Make the visual element instructionally meaningful, not decorative.
- The student should be able to start from a reaction equation, see the required reagents automatically appear, click a reagent, choose an amount, and observe visible outcomes such as bubbles, color change, temperature change, or precipitate formation.
- Include at least three default example equations the student can choose from when no custom equation is provided.
- Prefer familiar school-lab examples such as vinegar and baking soda, neutralization, and visible precipitate reactions.
- If a rich simulation is unavailable, fall back to a simple but explicit interactive state visualization.
- Do not invent precise measured data unless the user asks for a hypothetical example.
`,

  'CS Code Tracing Tutor': `# Background

You are an expert computer science tutor helping learners reason through code execution.

You are talking to beginners who need help tracing control flow, variables, and state changes step by step.

## Agent Configuration

- Mode: code tracing coach
- Visualized element: always include a visual trace such as a variable table, memory/state panel, control-flow diagram, or step timeline
- Tools you can use: external code execution APIs, tracing tools, embedded visualizers, or a custom-built trace view
- Output style: compact step-by-step traces with synchronized visual state changes and checkpoints for learner reflection
- Pedagogy rule: prefer tracing and questioning over giving the final solution

## Your Workflow

1. First, ask for the code, expected behavior, and where the learner feels confused.
2. Then, trace the code one step at a time, showing how variables and outputs change in both text and a visual trace.
3. Next, pause at key lines and ask the learner to predict the next state before continuing.
4. After the trace, summarize the bug, misconception, or key execution pattern in plain language.

## Guidelines & Guardrails

- Show state transitions in a clear order.
- Highlight loops, conditionals, and function calls when they change the trace.
- Prefer variable tables, pointer/state snapshots, or flow diagrams over text-only explanations.
- If a full code visualizer is unavailable, generate a lightweight custom trace table or state timeline.
- Do not skip from the initial code directly to the final answer.
`,

  'Music Staff Tutor': `# Background

You are an expert beginner music-reading tutor helping students learn five-line staff notation.

You are talking to learners who are just starting to read and write notes on the staff and connect notation to sound.

## Agent Configuration

- Mode: music staff coach
- Visualized element: always include an interactive five-line staff where the student can place notes, edit a short melody, and hear the notes played back
- Tools you can use: embedded notation widgets, WebAudio sound playback, clickable note palettes, or a custom-built staff editor
- Output style: short coaching turns that refer to the student’s current notes on the staff and the sounds they just heard
- Pedagogy rule: prioritize note-reading, pitch recognition, rhythm awareness, and guided correction over giving the answer immediately

## Your Workflow

1. First, ask what the student is practicing, such as note names, copying a melody, or writing a short pattern on the staff.
2. Then, generate or update an interactive five-line staff where the student can place notes and listen to them.
3. Next, ask the student to predict what a note or short melody will sound like before they press play.
4. After each interaction, explain how the written notes connect to staff position, note name, and pitch.

## Guidelines & Guardrails

- Use beginner-friendly music language and explain new terms clearly.
- Always refer to what is currently written on the staff when giving feedback.
- Encourage the student to listen, compare, revise, and try again.
- The student should be able to place notes directly on the staff and hear audio playback of individual notes or the whole melody.
- Prefer short, familiar examples such as stepwise melodies, repeated notes, and simple C-major patterns.
- If a rich notation renderer is unavailable, fall back to a lightweight interactive staff with clickable note positions and audio playback.
- Do not overwhelm the student with advanced theory unless they ask for it.
`,

  'Dyslexia Support Tutor': `# Background

You are an expert literacy support tutor helping teachers adapt reading and writing activities for students with dyslexia.

You are talking to learners who may need clearer text structure, lower visual load, explicit decoding support, and more accessible writing tasks.

## Agent Configuration

- Mode: dyslexia-friendly literacy support
- Visualized element: when helpful, present text in short chunks, highlighted syllables, keyword lists, guided reading frames, or step-by-step writing scaffolds
- Tools you can use: text simplification, structured reading supports, phonics-aware chunking, sentence frames, vocabulary previews, and rewrite suggestions
- Output style: calm, explicit, low-clutter instructions with short sentences and predictable structure
- Accessibility rule: always optimize for readability, reduced overload, and confidence-building support

## Your Workflow

1. First, ask for the original reading or writing exercise and the student's current challenge.
2. Then, transform the material into a dyslexia-friendly version with simpler layout, clearer wording, and manageable chunks.
3. Next, add supports such as vocabulary previews, sentence frames, decoding cues, or step-by-step instructions.
4. After that, explain to the teacher what was changed and why those adaptations are more supportive for students with dyslexia.

## Guidelines & Guardrails

- Break long paragraphs into short chunks.
- Prefer short, concrete sentences and familiar vocabulary when possible.
- Reduce unnecessary visual clutter and avoid dense blocks of text.
- When adapting writing tasks, provide explicit structure such as starters, frames, and checklists.
- When adapting reading tasks, support decoding and comprehension without making the content feel childish unless the teacher asks for that.
- Preserve the original learning objective while making the task more accessible.
- Keep a respectful, strengths-based tone and never frame dyslexia as lack of intelligence or effort.
`,
};

const FEATURED_AGENT_TEMPLATES = [
  {
    key: 'Chemistry Virtual Lab Tutor' as keyof typeof TEMPLATES,
    accent: 'emerald',
    description:
      'Interactive chemistry agent with clickable reagents, amount controls, and live lab effects.',
  },
  {
    key: 'CS Code Tracing Tutor' as keyof typeof TEMPLATES,
    accent: 'sky',
    description:
      'Interactive tracing agent with step-by-step execution, state views, and learner checkpoints.',
  },
  {
    key: 'Music Staff Tutor' as keyof typeof TEMPLATES,
    accent: 'violet',
    description:
      'Interactive five-line staff agent with note placement, melody playback, and music-reading support.',
  },
  {
    key: 'Dyslexia Support Tutor' as keyof typeof TEMPLATES,
    accent: 'amber',
    description:
      'Accessibility-focused literacy agent that rewrites reading and writing tasks into dyslexia-friendly versions.',
  },
] as const;
const FEATURED_AGENT_TEMPLATE_KEYS = new Set(
  FEATURED_AGENT_TEMPLATES.map((template) => template.key)
);

const BUILDER_STORAGE_KEY = 'instruction-doc-builder-state';
const DEFAULT_TEMPLATE_KEY = '— Select a template —' as const;
const GRADE_LEVEL_OPTIONS = [
  'Elementary school',
  'Middle school',
  'High school',
  'College / university',
  'Adult learner',
] as const;
const LANGUAGE_OPTIONS = [
  'English',
  'Chinese',
  'Bilingual (English + Chinese)',
  'Spanish',
  'Other',
] as const;

/* ---------- Default text if no template chosen ---------- */
const DEFAULT_MD = `# Background

You are an expert in ________.

Your role is to ________.

You are talking to ________.

## Agent Configuration

- Mode: ________.
- Tools or interaction style: ________.
- Output format: ________.
- Hard constraints: ________.

## Your Workflow

1. First, ________.
2. After they respond, then ________.
3. Next, ________.

## Guidelines & Guardrails

- Avoid language that might seem judgmental or dismissive.
- Be inclusive in your examples and explanations; consider multiple perspectives and avoid stereotypes.
- Provide clear and concise responses.
- If off-topic, prompt users to return to the main subject.
`;

function saveInstructionDoc(md: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('instruction-doc-md', md);
  window.dispatchEvent(
    new CustomEvent('instruction-doc-updated', { detail: { markdown: md } })
  );
}

export type BuilderState = Omit<PromptBuilderState, 'selectedTemplate'> & {
  selectedTemplate: keyof typeof TEMPLATES;
};

type SectionKey = 'objective' | 'exercises' | 'profile' | 'template';

const DEFAULT_BUILDER_STATE: BuilderState = {
  learningObjective: '',
  learningObjectivePrompt: '',
  uploadedExerciseName: '',
  uploadedExerciseText: '',
  exercisePrompt: '',
  gradeLevel: GRADE_LEVEL_OPTIONS[1],
  language: LANGUAGE_OPTIONS[0],
  learnerNotes: '',
  learnerProfilePrompt: '',
  selectedTemplate: DEFAULT_TEMPLATE_KEY,
  templatePrompt: '',
};

function saveBuilderState(state: BuilderState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state));
}

function coerceBuilderState(state?: Partial<PromptBuilderState> | null): BuilderState {
  return {
    ...DEFAULT_BUILDER_STATE,
    ...state,
    selectedTemplate:
      state?.selectedTemplate && state.selectedTemplate in TEMPLATES
        ? (state.selectedTemplate as keyof typeof TEMPLATES)
        : DEFAULT_TEMPLATE_KEY,
  };
}

function serializeBuilderState(state: BuilderState): PromptBuilderState {
  return {
    ...state,
    selectedTemplate: state.selectedTemplate,
  };
}

function loadBuilderState(): BuilderState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PromptBuilderState>;
    return coerceBuilderState(parsed);
  } catch {
    return null;
  }
}

function summarizeText(text: string, fallback: string) {
  const normalized = text
    .replace(/```[\w-]*\s*/g, '')
    .replace(/^#+\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return fallback;
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function buildPrompt(state: BuilderState) {
  const templateBody = TEMPLATES[state.selectedTemplate]?.trim();
  const sections = [
    `# Learning Objective\n\n${
      state.learningObjectivePrompt.trim() ||
      state.learningObjective.trim() ||
      'Describe the learning goal, target concept, and what success looks like for students.'
    }`,
    `# Learner Profile\n\n${
      state.learnerProfilePrompt.trim() ||
      `- Grade level: ${state.gradeLevel || 'Not specified'}\n- Language: ${state.language || 'Not specified'}\n- Additional learner notes: ${
        state.learnerNotes.trim() || 'None provided.'
      }`
    }`,
    `# Reference Learning Materials\n\n${
      state.exercisePrompt.trim()
        ? state.exercisePrompt.trim()
        : state.uploadedExerciseText.trim()
          ? `The teacher shared reference learning materials from **${state.uploadedExerciseName || 'a material file or link'}**:\n\n${state.uploadedExerciseText.trim()}`
          : 'No reference learning materials were provided. If the teacher later adds links or files, incorporate them into the tutoring flow.'
    }`,
    `# Template Selection\n\n${
      state.selectedTemplate !== DEFAULT_TEMPLATE_KEY
        ? `The teacher selected **${state.selectedTemplate}**.\n\n${templateBody}${
            state.templatePrompt.trim()
              ? `\n\n## Template Adaptation Notes\n\n${state.templatePrompt.trim()}`
              : ''
          }`
        : 'No template selected yet. Choose an instructional template below and tailor the agent behavior to it.'
    }`,
    `# Final Instruction\n\nUse the four sections above as the grounding context for this teaching agent. Keep the response aligned with the stated learning objective, adapt to the learner profile, reuse or transform any uploaded exercises when appropriate, and follow the selected template faithfully.`,
  ];

  return sections.join('\n\n');
}

function isFeaturedAgentTemplate(templateKey: keyof typeof TEMPLATES) {
  return FEATURED_AGENT_TEMPLATE_KEYS.has(templateKey);
}

function AccordionSection({
  title,
  step,
  summary,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  step: number;
  summary: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border shadow-sm transition ${
        isOpen
          ? 'border-sky-300 bg-sky-50/60 ring-2 ring-sky-100'
          : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                isOpen
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {step}
            </span>
            <span className={`text-sm font-semibold ${isOpen ? 'text-sky-950' : 'text-slate-900'}`}>
              {title}
            </span>
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                isOpen ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {typeof icon === 'string' ? icon : icon}
            </span>
            {isOpen && (
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Current step
              </span>
            )}
          </div>
          <div
            className={`mt-1.5 flex items-start gap-2 text-sm ${
              isOpen ? 'text-sky-800' : 'text-slate-500'
            }`}
          >
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
              <StepIcon
                d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 000-1.41L18.37 3.29a1 1 0 00-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13z"
                className="h-3.5 w-3.5"
              />
            </span>
            <p>{summary}</p>
          </div>
        </div>
        <span className={`text-sm font-medium ${isOpen ? 'text-sky-700' : 'text-slate-400'}`}>
          {isOpen ? 'Hide' : 'Show'}
        </span>
      </button>
      {isOpen && <div className="border-t border-sky-100 px-4 py-3">{children}</div>}
    </div>
  );
}

export default function InstructionDoc({
  appId: appIdProp,
  readOnly = false,
  initialBuilderState,
  initialPrompt,
}: {
  appId?: string;
  readOnly?: boolean;
  initialBuilderState?: PromptBuilderState | null;
  initialPrompt?: string;
}) {
  const params = useParams<{ appId: string }>();
  const appId = appIdProp || params?.appId || '';
  const editorRef = useRef<MDXEditorMethods>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const draftRequestIds = useRef<Record<SectionKey, number>>({
    objective: 0,
    exercises: 0,
    profile: 0,
    template: 0,
  });
  const draftedSignatures = useRef<Partial<Record<SectionKey, string>>>({});
  const desiredSignatures = useRef<Partial<Record<SectionKey, string>>>({});
  const [value, setValue] = useState<string>(DEFAULT_MD);
  const [builder, setBuilder] = useState<BuilderState>(DEFAULT_BUILDER_STATE);
  const [openSection, setOpenSection] = useState<SectionKey | null>('objective');
  const [promptOpen, setPromptOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [draftingSections, setDraftingSections] = useState<
    Partial<Record<SectionKey, boolean>>
  >({});
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionKey, string>>>({});

  const generatedPrompt = useMemo(() => buildPrompt(builder), [builder]);

  function applyPrompt(nextPrompt: string) {
    setValue(nextPrompt);
    if (!readOnly) {
      saveInstructionDoc(nextPrompt);
    }
    editorRef.current?.setMarkdown(nextPrompt);
  }

  function updateBuilder<K extends keyof BuilderState>(key: K, nextValue: BuilderState[K]) {
    if (readOnly) return;
    setAutoGenerate(true);
    setBuilder((current) => {
      const next = { ...current, [key]: nextValue };
      saveBuilderState(next);
      return next;
    });
  }

  function getDraftField(section: SectionKey): keyof BuilderState {
    if (section === 'objective') return 'learningObjectivePrompt';
    if (section === 'exercises') return 'exercisePrompt';
    if (section === 'profile') return 'learnerProfilePrompt';
    return 'templatePrompt';
  }

  function getSectionSignature(section: SectionKey, state: BuilderState) {
    if (section === 'objective') {
      return state.learningObjective.trim();
    }

    if (section === 'profile') {
      return JSON.stringify({
        gradeLevel: state.gradeLevel,
        language: state.language,
        learnerNotes: state.learnerNotes.trim(),
      });
    }

    if (section === 'exercises') {
      return JSON.stringify({
        uploadedExerciseName: state.uploadedExerciseName.trim(),
        uploadedExerciseText: state.uploadedExerciseText.trim(),
      });
    }

    return JSON.stringify({
      selectedTemplate: state.selectedTemplate,
      learningObjective: state.learningObjective.trim(),
      gradeLevel: state.gradeLevel,
      language: state.language,
      learnerNotes: state.learnerNotes.trim(),
      uploadedExerciseText: state.uploadedExerciseText.trim(),
    });
  }

  function hasMeaningfulSectionInput(section: SectionKey, state: BuilderState) {
    if (section === 'objective') {
      return Boolean(state.learningObjective.trim());
    }

    if (section === 'profile') {
      return Boolean(
        state.learnerNotes.trim() ||
          state.gradeLevel !== DEFAULT_BUILDER_STATE.gradeLevel ||
          state.language !== DEFAULT_BUILDER_STATE.language
      );
    }

    if (section === 'exercises') {
      return Boolean(state.uploadedExerciseName.trim() || state.uploadedExerciseText.trim());
    }

    return state.selectedTemplate !== DEFAULT_TEMPLATE_KEY;
  }

  async function draftSectionWithAI(section: SectionKey, signature: string) {
    draftRequestIds.current[section] += 1;
    const requestId = draftRequestIds.current[section];
    setDraftingSections((current) => ({ ...current, [section]: true }));
    setSectionErrors((current) => ({ ...current, [section]: '' }));

    try {
      const res = await fetch('/api/prompt-builder/section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          section,
          context: builder,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || 'Failed to draft this section.');
      }

      if (
        draftRequestIds.current[section] !== requestId ||
        desiredSignatures.current[section] !== signature
      ) {
        return;
      }
      draftedSignatures.current[section] = signature;
      updateBuilder(getDraftField(section), body?.draft || '');
    } catch (error: any) {
      if (
        draftRequestIds.current[section] !== requestId ||
        desiredSignatures.current[section] !== signature
      ) {
        return;
      }
      setSectionErrors((current) => ({
        ...current,
        [section]: error?.message || 'Failed to draft this section.',
      }));
    } finally {
      if (draftRequestIds.current[section] !== requestId) return;
      setDraftingSections((current) => ({ ...current, [section]: false }));
    }
  }

  async function handleExerciseUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      updateBuilder('uploadedExerciseName', file.name);
      updateBuilder('uploadedExerciseText', text.trim());
    } catch {
      updateBuilder('uploadedExerciseName', file.name);
      updateBuilder(
        'uploadedExerciseText',
        `Uploaded file: ${file.name}\n\nPlease use the file name as context and ask the teacher to paste the exercise content manually if more detail is needed.`
      );
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function hydrateFromLocalOrServer() {
      if (readOnly) {
        const readonlyBuilder = coerceBuilderState(initialBuilderState);
        const nextPrompt =
          initialPrompt?.trim() || buildPrompt(readonlyBuilder) || DEFAULT_MD;
        if (cancelled) return;
        setBuilder(readonlyBuilder);
        setValue(nextPrompt);
        editorRef.current?.setMarkdown(nextPrompt);
        setAutoGenerate(false);
        setHydrated(true);
        return;
      }

      const storedBuilder = loadBuilderState();
      const stored = localStorage.getItem('instruction-doc-md') || '';

      if (storedBuilder) {
        if (cancelled) return;
        setBuilder(storedBuilder);
        const nextPrompt = buildPrompt(storedBuilder);
        applyPrompt(nextPrompt);
        setAutoGenerate(true);
        setHydrated(true);
        return;
      }

      try {
        const res = await fetch(`/api/apps/${appId}`);
        const body = await res.json();
        if (!cancelled && res.ok && body?.app?.builderState) {
          const serverBuilder = coerceBuilderState(body.app.builderState);
          setBuilder(serverBuilder);
          const nextPrompt =
            body?.app?.systemPrompt?.trim() || buildPrompt(serverBuilder);
          applyPrompt(nextPrompt);
          saveBuilderState(serverBuilder);
          setAutoGenerate(true);
          setHydrated(true);
          return;
        }
      } catch {}

      if (cancelled) return;
      const initial = stored.trim() || buildPrompt(DEFAULT_BUILDER_STATE) || DEFAULT_MD;
      setValue(initial);
      saveInstructionDoc(initial);
      editorRef.current?.setMarkdown(initial);
      setAutoGenerate(!stored.trim());
      setHydrated(true);
    }

    void hydrateFromLocalOrServer();

    return () => {
      cancelled = true;
    };
  }, [appId, initialBuilderState, initialPrompt, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!hydrated || !autoGenerate) return;
    applyPrompt(generatedPrompt);
  }, [autoGenerate, generatedPrompt, hydrated, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!hydrated || !appId) return;

    const sections: SectionKey[] = ['objective', 'profile', 'exercises', 'template'];
    const timers = sections.map((section) => {
      const draftField = getDraftField(section);
      const signature = getSectionSignature(section, builder);

      if (!hasMeaningfulSectionInput(section, builder)) {
        desiredSignatures.current[section] = '';
        draftRequestIds.current[section] += 1;
        draftedSignatures.current[section] = '';
        setDraftingSections((current) => ({ ...current, [section]: false }));
        if (builder[draftField]) {
          updateBuilder(draftField, '');
        }
        if (sectionErrors[section]) {
          setSectionErrors((current) => ({ ...current, [section]: '' }));
        }
        return null;
      }

      desiredSignatures.current[section] = signature;
      if (draftedSignatures.current[section] === signature) {
        return null;
      }

      return window.setTimeout(() => {
        void draftSectionWithAI(section, signature);
      }, section === 'template' ? 500 : 900);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, [appId, builder, hydrated, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!hydrated || !appId) return;

    const timer = window.setTimeout(() => {
      void fetch(`/api/apps/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: value,
          builderState: serializeBuilderState(builder),
        }),
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [appId, builder, hydrated, readOnly, value]);

  const objectiveSummary = summarizeText(
    builder.learningObjectivePrompt || builder.learningObjective,
    "What's the learning objective?"
  );
  const exerciseSummary = builder.exercisePrompt
    ? summarizeText(builder.exercisePrompt, 'Paste a link or upload a reference file')
    : builder.uploadedExerciseName
      ? `${builder.uploadedExerciseName} uploaded`
      : 'Paste a link or upload a reference file';
  const learnerSummary = builder.learnerProfilePrompt
    ? summarizeText(builder.learnerProfilePrompt, 'Select learner profile')
    : `Grade ${builder.gradeLevel || 'not set'} · ${builder.language || 'language not set'}`;
  const templateSummary =
    builder.templatePrompt
      ? summarizeText(builder.templatePrompt, 'Select a teaching template')
      : builder.selectedTemplate === DEFAULT_TEMPLATE_KEY
      ? 'Select a teaching template'
      : builder.selectedTemplate;

  useEffect(() => {
    const wrapper = editorContainerRef.current;
    if (!wrapper) return;

    const contentRoot =
      (wrapper.querySelector('[contenteditable="true"]') as HTMLElement | null) || wrapper;

    const clearHighlight = () => {
      contentRoot
        .querySelectorAll('.prompt-section-active, .prompt-section-heading-active')
        .forEach((node) => {
          node.classList.remove('prompt-section-active');
          node.classList.remove('prompt-section-heading-active');
        });
    };

    const headingMap: Record<SectionKey, string> = {
      objective: 'learning objective',
      exercises: 'reference learning materials',
      profile: 'learner profile',
      template: 'template selection',
    };

    const getTopLevelNode = (node: HTMLElement) => {
      let current: HTMLElement | null = node;
      while (current && current.parentElement && current.parentElement !== contentRoot) {
        current = current.parentElement;
      }
      return current;
    };

    const applySectionHighlight = () => {
      clearHighlight();
      if (!openSection) return;

      const targetHeading = headingMap[openSection];
      const headings = Array.from(
        contentRoot.querySelectorAll('h1, h2, h3')
      ) as HTMLElement[];
      const startHeading = headings.find((heading) =>
        heading.textContent?.trim().toLowerCase().includes(targetHeading)
      );

      if (!startHeading) return;

      startHeading.classList.add('prompt-section-heading-active');

      const startNode = getTopLevelNode(startHeading);
      if (!startNode || !startNode.parentElement) return;

      let current: Element | null = startNode;
      while (current) {
        const nestedHeading =
          current instanceof HTMLElement
            ? (current.querySelector('h1, h2, h3') as HTMLElement | null)
            : null;

        if (
          current !== startNode &&
          ((/^H[1-3]$/.test(current.tagName) && current.textContent?.trim()) ||
            nestedHeading)
        ) {
          break;
        }

        if (current instanceof HTMLElement) {
          current.classList.add('prompt-section-active');
        }

        current = current.nextElementSibling;
      }

      startHeading.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const timer = window.setTimeout(applySectionHighlight, 80);
    return () => window.clearTimeout(timer);
  }, [openSection, value]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-slate-50/70 px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            Prompt Builder
          </span>
          <span className="text-sm text-slate-600">
            {readOnly
              ? 'Read-only shared project view.'
              : 'Fill the steps below and the system prompt will update automatically.'}
          </span>
        </div>

        <div className="space-y-2.5">
          <AccordionSection
            step={1}
            title="What's the learning objective?"
            summary={objectiveSummary}
            icon="🎯"
            isOpen={openSection === 'objective'}
            onToggle={() =>
              setOpenSection((current) => (current === 'objective' ? null : 'objective'))
            }
          >
            <label className="block text-sm font-medium text-slate-700">
              Describe the learning goal
            </label>
            <textarea
              rows={3}
              value={builder.learningObjective}
              onChange={(event) =>
                updateBuilder('learningObjective', event.target.value)
              }
              disabled={readOnly}
              placeholder="Example: Help Grade 7 students understand conservation of mass through predicting and explaining simple reactions."
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {draftingSections.objective && (
              <div className="mt-2 text-xs text-sky-700">
                Updating the learning objective in the system prompt...
              </div>
            )}
            {sectionErrors.objective && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {sectionErrors.objective}
              </div>
            )}
          </AccordionSection>

          <AccordionSection
            step={2}
            title="Select learner profile"
            summary={learnerSummary}
            icon="👩‍🎓"
            isOpen={openSection === 'profile'}
            onToggle={() =>
              setOpenSection((current) => (current === 'profile' ? null : 'profile'))
            }
          >
            <div className="mb-4 text-sm font-medium text-slate-700">
              Grade, language, and learner support needs
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Grade level
                </label>
                <select
                  value={builder.gradeLevel}
                  onChange={(event) => updateBuilder('gradeLevel', event.target.value)}
                  disabled={readOnly}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {GRADE_LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Language
                </label>
                <select
                  value={builder.language}
                  onChange={(event) => updateBuilder('language', event.target.value)}
                  disabled={readOnly}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">
                Additional learner notes
              </label>
              <textarea
                rows={3}
                value={builder.learnerNotes}
                onChange={(event) => updateBuilder('learnerNotes', event.target.value)}
                disabled={readOnly}
                placeholder="Example: multilingual learners, needs more scaffolding, preparing for an in-class lab, etc."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            {draftingSections.profile && (
              <div className="mt-2 text-xs text-sky-700">
                Updating the learner profile in the system prompt...
              </div>
            )}
            {sectionErrors.profile && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {sectionErrors.profile}
              </div>
            )}
          </AccordionSection>

          <AccordionSection
            step={3}
            title="Reference materials"
            summary={exerciseSummary}
            icon="📝"
            isOpen={openSection === 'exercises'}
            onToggle={() =>
              setOpenSection((current) => (current === 'exercises' ? null : 'exercises'))
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className={`inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium ${
                    readOnly
                      ? 'cursor-not-allowed text-slate-400'
                      : 'cursor-pointer text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Upload file
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    onChange={handleExerciseUpload}
                    disabled={readOnly}
                    className="sr-only"
                  />
                </label>
                <span className="text-sm text-slate-500">
                  {builder.uploadedExerciseName || 'or paste a link below'}
                </span>
              </div>

              <input
                type="text"
                value={builder.uploadedExerciseText}
                onChange={(event) =>
                  updateBuilder('uploadedExerciseText', event.target.value)
                }
                disabled={readOnly}
                placeholder="Paste a link or content."
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {draftingSections.exercises && (
                <div className="text-xs text-sky-700">
                  Updating the exercise context in the system prompt...
                </div>
              )}
              {sectionErrors.exercises && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sectionErrors.exercises}
                </div>
              )}
            </div>
          </AccordionSection>

          <AccordionSection
            step={4}
            title="Template selection"
            summary={templateSummary}
            icon="🧩"
            isOpen={openSection === 'template'}
            onToggle={() =>
              setOpenSection((current) => (current === 'template' ? null : 'template'))
            }
          >
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Choose a teaching template
                </label>
                <select
                  className={`mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-sky-400 ${
                    builder.selectedTemplate !== DEFAULT_TEMPLATE_KEY &&
                    !isFeaturedAgentTemplate(builder.selectedTemplate)
                      ? 'border-slate-200 text-slate-400'
                      : 'border-slate-300 text-slate-700'
                  } disabled:bg-slate-50 disabled:text-slate-500`}
                  value={builder.selectedTemplate}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateBuilder(
                      'selectedTemplate',
                      event.target.value as keyof typeof TEMPLATES
                    )
                  }
                >
                  {Object.keys(TEMPLATES).map((key) => (
                    <option
                      key={key}
                      value={key}
                      className={
                        key === DEFAULT_TEMPLATE_KEY ||
                        isFeaturedAgentTemplate(key as keyof typeof TEMPLATES)
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }
                    >
                      {key}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-500">
                  Featured agents stay highlighted. Other generic templates are shown in gray.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {FEATURED_AGENT_TEMPLATES.map((template) => {
                  const active = builder.selectedTemplate === template.key;
                  const cardClasses =
                    template.accent === 'emerald'
                      ? active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm'
                        : 'border-emerald-200 bg-white text-slate-700 hover:bg-emerald-50'
                      : template.accent === 'amber'
                        ? active
                          ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm'
                          : 'border-amber-200 bg-white text-slate-700 hover:bg-amber-50'
                      : template.accent === 'violet'
                        ? active
                          ? 'border-violet-300 bg-violet-50 text-violet-900 shadow-sm'
                          : 'border-violet-200 bg-white text-slate-700 hover:bg-violet-50'
                        : active
                          ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm'
                          : 'border-sky-200 bg-white text-slate-700 hover:bg-sky-50';
                  const iconClasses =
                    template.accent === 'emerald'
                      ? 'bg-emerald-100 text-emerald-700'
                      : template.accent === 'amber'
                        ? 'bg-amber-100 text-amber-700'
                      : template.accent === 'violet'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-sky-100 text-sky-700';

                  return (
                    <button
                      key={template.key}
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateBuilder('selectedTemplate', template.key)}
                      className={`flex min-w-[250px] items-start gap-3 rounded-2xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${cardClasses}`}
                    >
                      <div className={`mt-0.5 rounded-xl p-2 ${iconClasses}`}>
                        <AgentIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{template.key}</span>
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Beta
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {template.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {draftingSections.template && (
                <div className="text-xs text-sky-700">
                  Updating the template instructions in the system prompt...
                </div>
              )}
              {sectionErrors.template && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sectionErrors.template}
                </div>
              )}
            </div>
          </AccordionSection>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Generated system prompt</div>
            <div className="text-xs text-slate-500">
              {promptOpen
                ? 'You can still edit the final prompt directly below.'
                : 'Hidden by default. Expand to inspect or edit the final prompt.'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPromptOpen((current) => !current)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {promptOpen ? 'Hide' : 'Show'}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => applyPrompt(generatedPrompt)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Regenerate prompt
              </button>
            )}
          </div>
        </div>

        {promptOpen && (
          <div
            ref={editorContainerRef}
            className="instruction-doc-editor min-h-0 flex-1 overflow-hidden"
          >
            {readOnly ? (
              <div className="h-full overflow-auto px-6 pb-6 pt-4">
                <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800">
                  {value}
                </div>
              </div>
            ) : (
              <MDXEditor
                ref={editorRef}
                className="h-full overflow-auto px-6 pb-6"
                markdown={value}
                onChange={(md) => {
                  setValue(md || '');
                  saveInstructionDoc(md || '');
                }}
                plugins={[
                  headingsPlugin(),
                  listsPlugin(),
                  linkPlugin(),
                  quotePlugin(),
                  codeBlockPlugin(),
                  markdownShortcutPlugin(),
                  toolbarPlugin({
                    toolbarContents: () => (
                      <>
                        <BlockTypeSelect />
                        <BoldItalicUnderlineToggles />
                        <ListsToggle />
                        <CodeToggle />
                        <CreateLink />
                        <Separator />
                        <UndoRedo />
                      </>
                    ),
                  }),
                ]}
              />
            )}
          </div>
        )}
      </div>
      <style jsx global>{`
        .instruction-doc-editor .prompt-section-active {
          background: rgba(14, 165, 233, 0.08);
          border-radius: 12px;
          box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.18);
          transition: background 160ms ease, box-shadow 160ms ease;
        }

        .instruction-doc-editor .prompt-section-heading-active {
          color: rgb(3, 105, 161);
        }
      `}</style>
    </div>
  );
}
