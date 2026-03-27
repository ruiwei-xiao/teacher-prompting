'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { PromptBuilderState } from '@/lib/app-store/types';
import {
  readLegacyBuilderState,
  readStoredPrompt,
  saveStoredPrompt,
} from '@/lib/prompt-storage/client';
import {
  buildStudentProfilesPromptSection,
  ensurePromptHasStudentProfiles,
} from '@/lib/test-case-students';

type PromptFeedbackChangedBlock = {
  heading: string;
};

type PromptFeedbackEventDetail = {
  updatedPrompt?: string;
  changedBlocks?: PromptFeedbackChangedBlock[];
  summary?: string;
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
  '',
  buildStudentProfilesPromptSection(),
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
        const nextPrompt =
          initialPrompt?.trim() ||
          buildPlainPromptFromBuilder(initialBuilderState) ||
          DEFAULT_PROMPT;
        if (!cancelled) {
          setValue(normalizeText(nextPrompt));
          setHydrated(true);
        }
        return;
      }

      const storedPrompt = readStoredPrompt(appId);
      if (storedPrompt.trim()) {
        const nextPrompt = ensurePromptHasStudentProfiles(storedPrompt);
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
            const nextPrompt = ensurePromptHasStudentProfiles(
              body.app.systemPrompt?.trim() ||
              buildPlainPromptFromBuilder(body.app.builderState || initialBuilderState) ||
              DEFAULT_PROMPT
            );
            applyPrompt(nextPrompt);
            setHydrated(true);
            return;
          }
        } catch {}
      }

      const legacyBuilder = readLegacyBuilderState(appId) as Partial<PromptBuilderState> | null;
      if (legacyBuilder) {
        const nextPrompt = ensurePromptHasStudentProfiles(
          buildPlainPromptFromBuilder(legacyBuilder) || DEFAULT_PROMPT
        );
        if (!cancelled) {
          applyPrompt(nextPrompt);
          setHydrated(true);
        }
        return;
      }

      if (!cancelled) {
        applyPrompt(ensurePromptHasStudentProfiles(DEFAULT_PROMPT));
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
      <div className="shrink-0 border-b bg-slate-50/70 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
              Final Prompt
            </span>
            <span className="text-sm text-slate-600">{promptHint}</span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={applyCurrentPrompt}
              className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
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
            highlightPrompt ? 'bg-amber-50/60' : 'bg-white',
          ].join(' ')}
        >
          {readOnly ? (
            <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800">
              {value}
            </div>
          ) : (
            <textarea
              value={value}
              onChange={(event) => {
                const nextValue = event.target.value;
                setValue(nextValue);
                savePromptText(nextValue, appId);
              }}
              className={[
                'min-h-full w-full resize-none rounded-2xl border px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition',
                highlightPrompt
                  ? 'border-amber-300 bg-amber-50/60 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)]'
                  : 'border-slate-200 bg-white focus:border-sky-300',
              ].join(' ')}
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
