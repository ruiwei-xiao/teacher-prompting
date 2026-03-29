'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { PromptBuilderState } from '@/lib/app-store/types';
import {
  readLegacyBuilderState,
  readStoredPrompt,
  saveStoredPrompt,
} from '@/lib/prompt-storage/client';
import { stripTestCaseStudentsFromPrompt } from '@/lib/test-case-students';

type PromptFeedbackChangedBlock = {
  heading: string;
};

type PromptFeedbackEventDetail = {
  updatedPrompt?: string;
  changedBlocks?: PromptFeedbackChangedBlock[];
  summary?: string;
};

type PromptDiffLine = {
  kind: 'added' | 'removed' | 'unchanged';
  text: string;
};

type PromptUpdateBroadcastOptions = {
  applyToAllTestCases?: boolean;
};

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n');
}

function stripMarkdown(text: string) {
  return normalizeText(text)
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/```[\w-]*\n?/g, '')
        .replace(/```/g, '')
        .trim()
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function savePromptText(text: string, appId?: string, options?: PromptUpdateBroadcastOptions) {
  if (typeof window === 'undefined') return;

  saveStoredPrompt(text, appId);
  window.dispatchEvent(
    new CustomEvent('instruction-doc-updated', {
      detail: {
        appId,
        applyToAllTestCases: Boolean(options?.applyToAllTestCases),
        promptText: text,
        markdown: text,
      },
    })
  );
}

function buildPlainPromptFromBuilder(state?: Partial<PromptBuilderState> | null) {
  if (!state) return '';

  const learningObjective = stripMarkdown(
    state.learningObjectivePrompt?.trim() || state.learningObjective?.trim() || ''
  );
  const learnerProfile = stripMarkdown(
    state.learnerProfilePrompt?.trim() ||
      [
        state.gradeLevel ? `Grade level: ${state.gradeLevel}` : '',
        state.language ? `Language: ${state.language}` : '',
        state.learnerNotes?.trim()
          ? `Additional learner notes: ${state.learnerNotes.trim()}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
  );
  const materials = stripMarkdown(
    state.exercisePrompt?.trim() ||
      [
        state.uploadedExerciseName?.trim()
          ? `Reference material name: ${state.uploadedExerciseName.trim()}`
          : '',
        state.uploadedExerciseText?.trim() || '',
      ]
        .filter(Boolean)
        .join('\n\n')
  );
  const templateSelection = stripMarkdown(
    [
      state.selectedTemplate?.trim()
        ? `Selected teaching template: ${state.selectedTemplate.trim()}`
        : '',
      state.templatePrompt?.trim() ? state.templatePrompt.trim() : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  );

  const sections = [
    learningObjective ? `Learning objective\n${learningObjective}` : '',
    learnerProfile ? `Learner profile\n${learnerProfile}` : '',
    materials ? `Reference materials\n${materials}` : '',
    templateSelection ? `Template selection\n${templateSelection}` : '',
  ].filter(Boolean);

  if (!sections.length) return '';

  return [
    ...sections,
    'Final instruction\nUse the information above to guide the teaching agent. Keep responses aligned with the learning goal, adapt to the learner profile, reuse the provided materials when helpful, and follow the chosen teaching approach.',
  ].join('\n\n');
}

function buildPromptDiff(beforePrompt: string, afterPrompt: string): PromptDiffLine[] {
  const beforeLines = normalizeText(beforePrompt).split('\n');
  const afterLines = normalizeText(afterPrompt).split('\n');
  const dp = Array.from({ length: beforeLines.length + 1 }, () =>
    Array(afterLines.length + 1).fill(0)
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        beforeLines[i] === afterLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const diff: PromptDiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      diff.push({ kind: 'unchanged', text: beforeLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ kind: 'removed', text: beforeLines[i] });
      i += 1;
    } else {
      diff.push({ kind: 'added', text: afterLines[j] });
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    diff.push({ kind: 'removed', text: beforeLines[i] });
    i += 1;
  }

  while (j < afterLines.length) {
    diff.push({ kind: 'added', text: afterLines[j] });
    j += 1;
  }

  const changedIndexes = diff
    .map((line, index) => (line.kind === 'unchanged' ? -1 : index))
    .filter((index) => index >= 0);
  if (!changedIndexes.length) return [];

  const visible = new Set<number>();
  changedIndexes.forEach((index) => {
    for (
      let cursor = Math.max(0, index - 1);
      cursor <= Math.min(diff.length - 1, index + 1);
      cursor += 1
    ) {
      visible.add(cursor);
    }
  });

  const compact: PromptDiffLine[] = [];
  for (let index = 0; index < diff.length; index += 1) {
    if (visible.has(index)) {
      compact.push(diff[index]);
      continue;
    }

    const previous = compact[compact.length - 1];
    if (!previous || previous.text !== '...') {
      compact.push({ kind: 'unchanged', text: '...' });
    }
  }

  return compact;
}

const DEFAULT_PROMPT = [
  'Background',
  'You are an expert in ________.',
  'Your role is to __________.',
  'You are talking to __________.',
  '',
  'Your Workflow',
  'First, ___________.',
  'After they respond, then ___________.',
  'Next, ___________.',
  '',
  'Guidelines & Guardrails',
  'Avoid language that might seem judgmental or dismissive.',
  'Be inclusive in your examples and explanations, consider multiple perspectives, and avoid stereotypes.',
  'Provide clear and concise responses.',
  'If off-topic, prompt users to return to the main subject.',
].join('\n');

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
  const [value, setValue] = useState<string>(DEFAULT_PROMPT);
  const [hydrated, setHydrated] = useState(false);
  const [highlightPrompt, setHighlightPrompt] = useState(false);
  const [applyConfirmation, setApplyConfirmation] = useState(false);
  const [diffPreviewLines, setDiffPreviewLines] = useState<PromptDiffLine[]>([]);
  const [diffSummary, setDiffSummary] = useState('');
  const valueRef = useRef<string>(DEFAULT_PROMPT);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const promptHint = useMemo(
    () =>
      readOnly
        ? 'Read-only shared project view.'
        : 'Edit the final prompt directly. This is the only prompt authoring surface in the center column.',
    [readOnly]
  );

  const applyPrompt = useCallback(
    (nextPrompt: string) => {
      const normalized = normalizeText(nextPrompt);
      valueRef.current = normalized;
      setValue(normalized);
      if (!readOnly) {
        savePromptText(normalized, appId);
      }
    },
    [appId, readOnly]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function hydratePrompt() {
      if (readOnly) {
        const raw =
          initialPrompt?.trim() ||
          buildPlainPromptFromBuilder(initialBuilderState) ||
          DEFAULT_PROMPT;
        const nextPrompt =
          stripTestCaseStudentsFromPrompt(raw).trim() || DEFAULT_PROMPT;
        if (!cancelled) {
          setValue(normalizeText(nextPrompt));
          setHydrated(true);
        }
        return;
      }

      const storedPrompt = readStoredPrompt(appId);
      if (storedPrompt.trim()) {
        const nextPrompt =
          stripTestCaseStudentsFromPrompt(storedPrompt).trim() || DEFAULT_PROMPT;
        if (!cancelled) {
          applyPrompt(nextPrompt);
          setHydrated(true);
        }
        return;
      }

      if (appId) {
        try {
          const res = await fetch(`/api/apps/${appId}`);
          const body = await res.json();
          if (!cancelled && res.ok && body?.app) {
            const raw =
              body.app.systemPrompt?.trim() ||
              buildPlainPromptFromBuilder(body.app.builderState || initialBuilderState) ||
              DEFAULT_PROMPT;
            const nextPrompt = stripTestCaseStudentsFromPrompt(raw).trim() || DEFAULT_PROMPT;
            applyPrompt(nextPrompt);
            setHydrated(true);
            return;
          }
        } catch {}
      }

      const legacyBuilder = readLegacyBuilderState(appId) as Partial<PromptBuilderState> | null;
      if (legacyBuilder) {
        const raw = buildPlainPromptFromBuilder(legacyBuilder) || DEFAULT_PROMPT;
        const nextPrompt = stripTestCaseStudentsFromPrompt(raw).trim() || DEFAULT_PROMPT;
        if (!cancelled) {
          applyPrompt(nextPrompt);
          setHydrated(true);
        }
        return;
      }

      if (!cancelled) {
        applyPrompt(DEFAULT_PROMPT);
        setHydrated(true);
      }
    }

    void hydratePrompt();

    return () => {
      cancelled = true;
    };
  }, [appId, applyPrompt, initialBuilderState, initialPrompt, readOnly]);

  useEffect(() => {
    if (readOnly) return;

    const onPromptFeedback = (event: Event) => {
      const customEvent = event as CustomEvent<PromptFeedbackEventDetail>;
      const updatedPrompt = customEvent.detail?.updatedPrompt?.trim();
      if (!updatedPrompt) return;

      setDiffPreviewLines(buildPromptDiff(valueRef.current, updatedPrompt));
      setDiffSummary(customEvent.detail?.summary || '');
      setHighlightPrompt(true);
      applyPrompt(updatedPrompt);
    };

    window.addEventListener('prompt-feedback-applied', onPromptFeedback);
    return () => {
      window.removeEventListener('prompt-feedback-applied', onPromptFeedback);
    };
  }, [applyPrompt, readOnly]);

  useEffect(() => {
    if (!highlightPrompt) return;
    const timer = window.setTimeout(() => setHighlightPrompt(false), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightPrompt]);

  useEffect(() => {
    if (!applyConfirmation) return;
    const timer = window.setTimeout(() => setApplyConfirmation(false), 1800);
    return () => window.clearTimeout(timer);
  }, [applyConfirmation]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || readOnly) return;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(320, textarea.scrollHeight)}px`;
  }, [readOnly, value, diffPreviewLines.length]);

  const applyCurrentPrompt = useCallback(() => {
    const normalized = normalizeText(value);
    savePromptText(normalized, appId, { applyToAllTestCases: true });
    setHighlightPrompt(true);
    setApplyConfirmation(true);
  }, [appId, value]);

  useEffect(() => {
    if (readOnly) return;
    if (!hydrated || !appId) return;

    const timer = window.setTimeout(() => {
      void fetch(`/api/apps/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: value,
        }),
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [appId, hydrated, readOnly, value]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200">
              Final Prompt
            </span>
            <span className="text-sm text-slate-600 dark:text-zinc-300">{promptHint}</span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={applyCurrentPrompt}
              className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              {applyConfirmation ? 'Applied' : 'Apply current prompt'}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className={[
            'h-full overflow-auto px-6 pb-6 pt-4 transition',
            highlightPrompt
              ? 'bg-amber-50/60 dark:bg-amber-950/25'
              : 'bg-white dark:bg-zinc-900',
          ].join(' ')}
        >
          {readOnly ? (
            <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              {value}
            </div>
          ) : (
            <div
              className={[
                'overflow-hidden rounded-2xl border transition',
                highlightPrompt
                  ? 'border-amber-300 bg-amber-50/60 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)] dark:border-amber-800 dark:bg-amber-950/30'
                  : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
              ].join(' ')}
            >
              {!!diffPreviewLines.length && (
                <div className="border-b border-slate-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/90">
                  <div className="max-h-56 overflow-auto font-mono text-[12px] leading-6">
                    {diffPreviewLines.map((line, index) => (
                      <div
                        key={`${line.kind}-${index}-${line.text}`}
                        className={[
                          'flex gap-3 px-4 py-0.5',
                          line.kind === 'added'
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : line.kind === 'removed'
                              ? 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                              : 'text-slate-500 dark:text-zinc-400',
                        ].join(' ')}
                      >
                        <span className="w-4 shrink-0 text-center">
                          {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                        </span>
                        <span className="min-w-0 whitespace-pre-wrap break-words">{line.text || ' '}</span>
                      </div>
                    ))}
                  </div>
                  {diffSummary && (
                    <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-zinc-800 dark:text-zinc-300">
                      {diffSummary}
                    </div>
                  )}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  valueRef.current = nextValue;
                  setValue(nextValue);
                  setDiffPreviewLines([]);
                  setDiffSummary('');
                  savePromptText(nextValue, appId);
                }}
                className="w-full resize-none bg-transparent px-4 py-4 text-sm leading-7 text-slate-800 outline-none dark:text-zinc-100 dark:placeholder:text-zinc-400"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
