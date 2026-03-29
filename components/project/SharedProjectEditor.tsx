"use client";

import { useMemo, useState } from "react";
import EditorChrome from "@/components/editor/EditorChrome";
import InstructionDoc from "@/components/editor/InstructionDoc";
import RightRail from "@/components/editor/RightRail";
import AssistantPanel from "@/components/editor/AssistantPanel";
import {
  formatVariabilityLabel,
  getModelLabel,
  normalizeVariability,
} from "@/lib/app-store/model-selection";
import type { AppConfig } from "@/lib/app-store/types";

export default function SharedProjectEditor({
  app,
  visibleAuthorName,
  duplicateAction,
}: {
  app: AppConfig;
  visibleAuthorName?: string;
  duplicateAction: () => void;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const modelLabel = useMemo(
    () => getModelLabel(app.provider, app.model),
    [app.model, app.provider]
  );
  const variabilityLabel = useMemo(
    () => formatVariabilityLabel(normalizeVariability(app.variability)),
    [app.variability]
  );

  const gridCols = assistantOpen
    ? "grid-cols-1 xl:grid-cols-[88px_0.72fr_1.7fr_1.05fr]"
    : "grid-cols-1 xl:grid-cols-[88px_1.7fr_1.05fr]";

  return (
    <EditorChrome
      appName={app.name}
      modelLabel={modelLabel}
      variabilityLabel={variabilityLabel}
    >
      <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Shared project editor
            </div>
            <div className="mt-1">
              This is the same editor layout in read-only mode.
              {visibleAuthorName ? ` Shared by ${visibleAuthorName}.` : ""}
            </div>
          </div>
          <form action={duplicateAction}>
            <button
              type="submit"
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Duplicate this project
            </button>
          </form>
        </div>
      </div>

      <div
        className={`grid h-full min-h-0 overflow-hidden ${gridCols} gap-0 divide-x divide-slate-200 dark:divide-zinc-800/90`}
      >
        <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-900">
          <RightRail
            assistantOpen={assistantOpen}
            settingsOpen={false}
            showSettings={false}
            onToggleAssistant={() => setAssistantOpen((value) => !value)}
            onOpenSettings={() => {}}
          />
        </div>

        {assistantOpen && (
          <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-900">
            <section className="flex h-full flex-col border-r border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-slate-200 bg-sky-50/70 px-6 py-4 dark:border-zinc-700 dark:bg-sky-950/40">
                <div className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  Assistant
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
                  The teacher assistant is disabled in the shared read-only view.
                </div>
              </div>
              <div className="flex-1 px-6 py-5 text-sm leading-7 text-slate-600 dark:text-zinc-300">
                Duplicate the project to continue editing prompts, using the
                assistant, and publishing your own version.
              </div>
            </section>
          </div>
        )}

        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950">
          <div className="min-h-0 flex-1 overflow-hidden">
            <InstructionDoc
              appId={app.id}
              readOnly={true}
              initialBuilderState={app.builderState}
              initialPrompt={app.systemPrompt}
            />
          </div>
        </section>

        <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-950">
          <AssistantPanel
            appId={app.id}
            appName={app.name}
            readOnly={true}
            promptOverride={app.systemPrompt || ""}
            modelLabelOverride={modelLabel}
          />
        </div>
      </div>
    </EditorChrome>
  );
}
