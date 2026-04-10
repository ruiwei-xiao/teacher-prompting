'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { RefObject } from 'react';
import { useParams } from 'next/navigation';
import type { PromptBuilderState } from '@/lib/app-store/types';
import {
  readLegacyBuilderState,
  readStoredPrompt,
  saveStoredPrompt,
} from '@/lib/prompt-storage/client';
import { stripTestCaseStudentsFromPrompt } from '@/lib/test-case-students';
import {
  buildTeacherPromptAttachmentBlock,
  TEACHER_PROMPT_ATTACHMENT_ACCEPT,
} from '@/lib/chat-input/client';
import { TEACHING_AGENT_TEMPLATES } from '@/lib/prompt-builder/teaching-agent-templates';
import {
  DEFAULT_INSTRUCTION_PROMPT as DEFAULT_PROMPT,
  isDefaultInstructionPrompt,
} from '@/lib/prompt-defaults';

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

function ToolbarIconFrame({
  children,
  compact,
  inline,
}: {
  children: ReactNode;
  compact?: boolean;
  /** When set with `compact`, drop bottom margin for horizontal toolbar buttons. */
  inline?: boolean;
}) {
  if (compact) {
    return (
      <div
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3E078] dark:bg-amber-200/90',
          inline ? '' : 'mb-1.5',
        ].join(' ')}
      >
        <span className="text-slate-900 dark:text-zinc-900 [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {children}
        </span>
      </div>
    );
  }
  return (
    <div className="mb-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F3E078] dark:bg-amber-200/90">
      <span className="text-slate-900 dark:text-zinc-900">{children}</span>
    </div>
  );
}

function IconBranchTemplate() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="5.5" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 8v4M12 12H8.5M12 12h3.5" />
      <path d="M8.5 12v2.5a2 2 0 0 0 2 2M15.5 12v2.5a2 2 0 0 1-2 2" />
      <circle cx="8" cy="19" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="19" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconAttachmentFile() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
      <line x1="9" y1="11" x2="13" y2="11" />
    </svg>
  );
}

export default function InstructionDoc({
  appId: appIdProp,
  readOnly = false,
  initialBuilderState,
  initialPrompt,
  spotlightPromptRef,
  spotlightAttachmentRef,
  spotlightAgentRef,
  spotlightApplyPromptRef,
}: {
  appId?: string;
  readOnly?: boolean;
  initialBuilderState?: PromptBuilderState | null;
  initialPrompt?: string;
  spotlightPromptRef?: RefObject<HTMLDivElement | null>;
  spotlightAttachmentRef?: RefObject<HTMLButtonElement | null>;
  spotlightAgentRef?: RefObject<HTMLButtonElement | null>;
  spotlightApplyPromptRef?: RefObject<HTMLButtonElement | null>;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachError, setAttachError] = useState('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [promptDropActive, setPromptDropActive] = useState(false);
  const promptDropZoneRef = useRef<HTMLDivElement | null>(null);

  const insertIntoPrompt = useCallback(
    (insertion: string) => {
      if (readOnly || !insertion) return;
      setAttachError('');
      const ta = textareaRef.current;
      const cur = valueRef.current;
      if (!ta) {
        const spacer = cur.trim() ? '\n\n' : '';
        const next = `${cur}${spacer}${insertion}`;
        valueRef.current = next;
        setValue(next);
        setDiffPreviewLines([]);
        setDiffSummary('');
        savePromptText(next, appId);
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = cur.slice(0, start) + insertion + cur.slice(end);
      valueRef.current = next;
      setValue(next);
      setDiffPreviewLines([]);
      setDiffSummary('');
      savePromptText(next, appId);
      const caret = start + insertion.length;
      queueMicrotask(() => {
        ta.focus();
        ta.setSelectionRange(caret, caret);
      });
    },
    [appId, readOnly]
  );

  const promptHint = useMemo(
    () =>
      readOnly
        ? 'Read-only shared project view.'
        : 'Edit the final prompt.',
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
      const storedStripped =
        stripTestCaseStudentsFromPrompt(storedPrompt).trim() || '';
      const storedIsOnlyDefaultTemplate =
        !!storedStripped &&
        (isDefaultInstructionPrompt(storedPrompt) ||
          isDefaultInstructionPrompt(storedStripped));
      if (storedStripped && !storedIsOnlyDefaultTemplate) {
        const nextPrompt = storedStripped || DEFAULT_PROMPT;
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
            const fromServer =
              (typeof body.app.systemPrompt === 'string'
                ? body.app.systemPrompt.trim()
                : '') ||
              (typeof body.app.description === 'string'
                ? body.app.description.trim()
                : '');
            const raw =
              fromServer ||
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
    if (!templateModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTemplateModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateModalOpen]);

  const applyCurrentPrompt = useCallback(() => {
    const normalized = normalizeText(value);
    savePromptText(normalized, appId, { applyToAllTestCases: true });
    setHighlightPrompt(true);
    setApplyConfirmation(true);
  }, [appId, value]);

  const onTeacherAttachFiles = useCallback(
    async (files: FileList | null) => {
      if (readOnly || !files?.length) return;
      const list = Array.from(files);
      const input = fileInputRef.current;
      if (input) input.value = '';
      setAttachError('');
      try {
        for (const file of list) {
          const block = await buildTeacherPromptAttachmentBlock(file);
          const wrapped = `\n\n### Reference (attached: ${file.name})\n\n${block}\n`;
          insertIntoPrompt(wrapped);
        }
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : 'Could not read that file.');
      }
    },
    [insertIntoPrompt, readOnly]
  );

  const { promptFileDragProps, promptFileDropRelayProps } = useMemo(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer.types).includes('Files');

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setPromptDropActive(false);
      void onTeacherAttachFiles(e.dataTransfer.files);
    };

    return {
      promptFileDragProps: {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setPromptDropActive(true);
        },
        onDragLeave: (e: DragEvent) => {
          const related = e.relatedTarget as Node | null;
          if (related && promptDropZoneRef.current?.contains(related)) return;
          setPromptDropActive(false);
        },
        onDragOver,
        onDrop,
      },
      promptFileDropRelayProps: { onDragOver, onDrop },
    };
  }, [onTeacherAttachFiles]);

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
              ref={spotlightApplyPromptRef}
              type="button"
              onClick={applyCurrentPrompt}
              className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              {applyConfirmation ? 'Applied' : 'Apply current prompt'}
            </button>
          )}
        </div>
        {!readOnly && (
          <p className="text-[11px] leading-snug text-slate-500 dark:text-zinc-400">
            The first time you open an app, a guided spotlight walks the Final Prompt, attachments, templates, then the
            test suite on the right. New apps auto-generate previews when a prompt is available; use{' '}
            <span className="font-medium text-slate-700 dark:text-zinc-300">Apply current prompt</span> to refresh them
            after edits.
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={[
            'flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-4 pt-4 transition',
            highlightPrompt
              ? 'bg-amber-50/60 dark:bg-amber-950/25'
              : 'bg-white dark:bg-zinc-900',
          ].join(' ')}
        >
          {readOnly ? (
            <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              {value}
            </div>
          ) : (
            <div
              ref={spotlightPromptRef}
              className={[
                'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border transition',
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
              <div
                ref={promptDropZoneRef}
                className={[
                  'flex min-h-0 flex-1 flex-col transition',
                  promptDropActive
                    ? 'ring-2 ring-inset ring-emerald-500/40 bg-emerald-50/25 dark:bg-emerald-950/25 dark:ring-emerald-400/35'
                    : '',
                ].join(' ')}
                {...promptFileDragProps}
              >
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
                  className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-7 text-slate-800 outline-none dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  spellCheck={false}
                  {...promptFileDragProps}
                />
                <div
                  className="shrink-0 border-t border-slate-200 bg-slate-50/90 dark:border-zinc-800 dark:bg-zinc-950/80"
                  {...promptFileDragProps}
                >
                  <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept={TEACHER_PROMPT_ATTACHMENT_ACCEPT}
                      multiple
                      onChange={(event) => void onTeacherAttachFiles(event.target.files)}
                    />
                    <button
                      ref={spotlightAttachmentRef}
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex max-w-full flex-1 items-center gap-2.5 rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-slate-300 hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 sm:flex-none"
                      {...promptFileDropRelayProps}
                    >
                      <ToolbarIconFrame compact inline>
                        <IconAttachmentFile />
                      </ToolbarIconFrame>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-semibold text-slate-900 dark:text-zinc-50">
                          Attachment
                        </span>
                        <span className="text-[10px] font-medium tracking-wide text-slate-400 dark:text-zinc-500">
                          Reference
                        </span>
                      </span>
                    </button>
                    <button
                      ref={spotlightAgentRef}
                      type="button"
                      onClick={() => setTemplateModalOpen(true)}
                      className="inline-flex max-w-full flex-1 items-center gap-2.5 rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-slate-300 hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 sm:flex-none"
                      {...promptFileDropRelayProps}
                    >
                      <ToolbarIconFrame compact inline>
                        <IconBranchTemplate />
                      </ToolbarIconFrame>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-semibold text-slate-900 dark:text-zinc-50">
                          Agent
                        </span>
                        <span className="text-[10px] font-medium tracking-wide text-slate-400 dark:text-zinc-500">
                          Template
                        </span>
                      </span>
                    </button>
                  </div>
                  {attachError ? (
                    <p className="border-t border-slate-200 px-3 py-2 text-xs text-rose-600 dark:border-zinc-800 dark:text-rose-400">
                      {attachError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {templateModalOpen && !readOnly ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 dark:bg-black/55"
          role="presentation"
          onClick={() => setTemplateModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-picker-title"
            className="flex max-h-[min(560px,85vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
              <h2
                id="template-picker-title"
                className="text-lg font-semibold text-slate-900 dark:text-zinc-50"
              >
                Choose a template
              </h2>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {TEACHING_AGENT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      insertIntoPrompt(t.body);
                      setTemplateModalOpen(false);
                    }}
                    className="flex flex-col rounded-2xl border border-slate-200/95 bg-white p-3.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                  >
                    <ToolbarIconFrame>
                      <IconBranchTemplate />
                    </ToolbarIconFrame>
                    <span className="text-sm font-semibold text-slate-900 dark:text-zinc-50">
                      {t.label}
                    </span>
                    <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-zinc-400">
                      {t.description}
                    </p>
                    <span className="mt-2.5 text-[11px] font-medium tracking-wide text-slate-400 dark:text-zinc-500">
                      Template
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
