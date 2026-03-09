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
};

/* ---------- Default text if no template chosen ---------- */
const DEFAULT_MD = `# Background

You are an expert in ________.

Your role is to ________.

You are talking to ________.

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

  const previewTemplate = () => {
    if (!selectedTemplate) return;
    editorRef.current?.setMarkdown(selectedTemplate);
    // Undo via toolbar if needed
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
            <button
              type="button"
              onClick={previewTemplate}
              disabled={!selectedTemplate}
              className="h-9 px-3 rounded-md border text-sm disabled:opacity-50"
              title="Preview the template (you can Undo with the toolbar)"
            >
              Preview
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
