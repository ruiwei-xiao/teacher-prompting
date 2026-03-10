'use client';

import { useEffect, useRef, useState } from 'react';
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
Design a short **practice plan** that spaces 5 mini-exercises over time and includes quick **retrieval** checks.

## Instructions
- Each exercise should take ~2–3 minutes and revisit the same concept (e.g., for-loop over indices) with slight variation.
- After each, include a **one-question quiz** to test recall (no code solution).

## Guardrails
- Keep prompts minimal and focused.
- Do **not** provide final code.
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

export default function InstructionDoc() {
  const editorRef = useRef<MDXEditorMethods>(null);
  const [value, setValue] = useState<string>(DEFAULT_MD);
  const [selectedKey, setSelectedKey] =
    useState<keyof typeof TEMPLATES>('— Select a template —');
  const selectedTemplate = TEMPLATES[selectedKey] ?? '';

  const insertTemplate = () => {
    if (!selectedTemplate) return;
    editorRef.current?.setMarkdown(selectedTemplate);
    setValue(selectedTemplate);
    saveInstructionDoc(selectedTemplate);
  };

  const appendTemplate = () => {
    if (!selectedTemplate) return;
    const next = value.trim().length ? `${value}\n\n${selectedTemplate}` : selectedTemplate;
    editorRef.current?.setMarkdown(next);
    setValue(next);
    saveInstructionDoc(next);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('instruction-doc-md') || '';
    const initial = stored.trim() || DEFAULT_MD;

    setValue(initial);
    saveInstructionDoc(initial);
    editorRef.current?.setMarkdown(initial);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Top strip with dropdown + actions */}
      <div className="w-full border-b bg-white px-3 md:px-4 py-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                System Prompt Editor
              </span>
              <span className="text-sm text-slate-600">
                Editing system prompt for Preview panel
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Templates:</label>
              <select
                className="h-9 min-w-[260px] rounded-md border px-2 text-sm"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value as keyof typeof TEMPLATES)}
              >
                {Object.keys(TEMPLATES).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {FEATURED_AGENT_TEMPLATES.map((template) => {
                const active = selectedKey === template.key;
                const cardClasses =
                  template.accent === 'emerald'
                    ? active
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm'
                      : 'border-emerald-200 bg-white text-slate-700 hover:bg-emerald-50'
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
                    : template.accent === 'violet'
                      ? 'bg-violet-100 text-violet-700'
                    : 'bg-sky-100 text-sky-700';

                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => setSelectedKey(template.key)}
                    className={`flex min-w-[250px] items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${cardClasses}`}
                    title={`Select ${template.key}`}
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
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={insertTemplate}
              disabled={!selectedTemplate}
              className="h-9 px-3 rounded-md bg-sky-600 text-white text-sm disabled:opacity-50"
              title="Replace the editor content with the selected template"
            >
              Insert
            </button>
            <button
              type="button"
              onClick={appendTemplate}
              disabled={!selectedTemplate}
              className="h-9 px-3 rounded-md border text-sm disabled:opacity-50"
              title="Append the selected template at the end"
            >
              Append
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <MDXEditor
        ref={editorRef}
        className="flex-1 overflow-auto px-6 pb-6"
        markdown={value}
        onChange={(md) => {
          setValue(md);
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
            )
          })
        ]}
      />
    </div>
  );
}
