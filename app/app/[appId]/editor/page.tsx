"use client";
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import EditorChrome from "@/components/editor/EditorChrome";
import EditorTestcaseSpotlight from "@/components/editor/EditorTestcaseSpotlight";
import type { SpotlightHoleRect } from "@/components/editor/EditorTestcaseSpotlight";
import {
  EDITOR_SPOTLIGHT_STEPS,
  editorSpotlightTourBody,
  editorSpotlightTourStorageKey,
  editorSpotlightTourTitle,
  filterSpotlightStepsForMode,
} from "@/components/editor/editorSpotlightTourSteps";
import type { AssistantPanelSpotlightTargetRefs } from "@/components/editor/AssistantPanel";
import LeftChat from "@/components/editor/LeftChat";
import InstructionDoc from "@/components/editor/InstructionDoc";
import RightRail from "@/components/editor/RightRail";
import AssistantPanel from "@/components/editor/AssistantPanel";
import AppSettingsDialog from "@/components/editor/AppSettingsDialog";
import PublishDialog from "@/components/editor/PublishDialog";
import ShareDialog from "@/components/dashboard/ShareDialog";
import {
  formatVariabilityLabel,
  getModelLabel,
  normalizeVariability,
} from "@/lib/app-store/model-selection";
import { isDefaultInstructionPrompt } from "@/lib/prompt-defaults";
import { readStoredPrompt, saveStoredPrompt } from "@/lib/prompt-storage/client";
import {
  buildEducatorSharePatchBody,
  educatorSharePatchErrorMessage,
} from "@/lib/workspace-api/share-patch-body";
import { resolveAssistedAuthoringMode } from "@/lib/assisted-authoring/resolve";
import { shouldBlockPublishForTestCases } from "@/lib/assisted-authoring/publish-gate";
import { shouldShowTestCaseRail } from "@/lib/assisted-authoring/test-case-rail";
import { planOnToOffTransition, shouldPersistOnToOffTransition } from "@/lib/assisted-authoring/on-to-off-transition";
import { shouldPersistOffToOnTransition } from "@/lib/assisted-authoring/off-to-on-transition";
import { saveAssistedAuthoringSnapshot, planOffToOnTransition } from "@/lib/assisted-authoring/snapshot";

function PanelResizeHandle({
  label,
  active,
  onPointerDown,
}: {
  label: string;
  active: boolean;
  onPointerDown: () => void;
}) {
  return (
    <div className="group relative flex w-3 shrink-0 items-stretch justify-center bg-white dark:bg-zinc-900">
      <div
        className={[
          "h-full w-px bg-slate-200 transition dark:bg-zinc-700",
          active
            ? "bg-sky-400 dark:bg-sky-500"
            : "group-hover:bg-slate-300 dark:group-hover:bg-zinc-600",
        ].join(" ")}
      />
      <button
        type="button"
        aria-label={label}
        onPointerDown={(event) => {
          event.preventDefault();
          onPointerDown();
        }}
        className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
      >
        <span
          className={[
            "absolute left-1/2 top-1/2 h-14 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition",
            active
              ? "bg-sky-400/80 dark:bg-sky-500/80"
              : "bg-slate-200/0 group-hover:bg-slate-200 dark:group-hover:bg-zinc-600",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function EditorPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = use(params);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState(0);
  const [appName, setAppName] = useState(appId);
  const [assistedAuthoringMode, setAssistedAuthoringMode] = useState(true); // Default to ON
  const [modeHydrated, setModeHydrated] = useState(false); // Track if mode loaded from server
  const [headerModelLabel, setHeaderModelLabel] = useState("Loading model...");
  const [headerVariabilityLabel, setHeaderVariabilityLabel] = useState(
    formatVariabilityLabel()
  );
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishUrl, setPublishUrl] = useState("");
  const [publishError, setPublishError] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [testCaseStatus, setTestCaseStatus] = useState({
    totalCount: 0,
    passedCount: 0,
    allPassed: false,
    chatLayoutKey: "",
  });
  // Snapshot data for ON→OFF transition preservation (Task 3.4)
  const [currentTestCasesSnapshot, setCurrentTestCasesSnapshot] = useState<{
    testCases: unknown[];
    finalPromptText: string;
  }>({ testCases: [], finalPromptText: "" });
  const [snapshotError, setSnapshotError] = useState("");
  // Bootstrap data for OFF→ON transition restore or regenerate (Task 3.5)
  const [offToOnBootstrapAction, setOffToOnBootstrapAction] = useState<
    | { action: "restore"; testCases: unknown[] }
    | { action: "regenerate" }
    | null
  >(null);
  const [offToOnError, setOffToOnError] = useState("");
  const [communitySubject, setCommunitySubject] = useState("General");
  const [communityTagsInput, setCommunityTagsInput] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareError, setShareError] = useState("");
  const [projectShareUrl, setProjectShareUrl] = useState("");
  const [chatbotShareUrl, setChatbotShareUrl] = useState("");
  const [chatbotShareError, setChatbotShareError] = useState("");
  const [projectShareVisibility, setProjectShareVisibility] = useState<
    "private" | "public"
  >("private");
  const [shareAuthorName, setShareAuthorName] = useState(false);
  const [forkedFromProjectName, setForkedFromProjectName] = useState("");
  const [forkedFromAuthorName, setForkedFromAuthorName] = useState("");
  const [forkedFromProjectShareSlug, setForkedFromProjectShareSlug] = useState("");
  const [editorPaneWidth, setEditorPaneWidth] = useState(62);
  const [assistantPaneWidth, setAssistantPaneWidth] = useState(40);
  const [resizingPanel, setResizingPanel] = useState<
    null | "assistant-main" | "editor-testcases"
  >(null);
  const assistantSplitRef = useRef<HTMLDivElement>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const publishSpotlightRef = useRef<HTMLButtonElement>(null);
  const spotlightPromptRef = useRef<HTMLDivElement>(null);
  const spotlightAttachmentRef = useRef<HTMLButtonElement>(null);
  const spotlightAgentRef = useRef<HTMLButtonElement>(null);
  const spotlightApplyPromptRef = useRef<HTMLButtonElement>(null);
  const spotlightSimulatedChatRef = useRef<HTMLDivElement>(null);
  const spotlightCase0Ref = useRef<HTMLDivElement>(null);
  const spotlightCase1Ref = useRef<HTMLDivElement>(null);
  const spotlightAddCaseRef = useRef<HTMLButtonElement>(null);
  const spotlightMarkPassRef = useRef<HTMLButtonElement>(null);
  const [editorSpotlightStep, setEditorSpotlightStep] = useState<number | null>(null);
  const [editorSpotlightRect, setEditorSpotlightRect] = useState<SpotlightHoleRect | null>(null);

  // Track previous assistedAuthoringMode for transition detection (Task 3.4, 3.5)
  const previousAssistedAuthoringModeRef = useRef<boolean | null>(null);

  const spotlightTargetRefs = useMemo<AssistantPanelSpotlightTargetRefs>(
    () => ({
      simulatedChat: spotlightSimulatedChatRef,
      case0: spotlightCase0Ref,
      case1: spotlightCase1Ref,
      addCase: spotlightAddCaseRef,
      markPass: spotlightMarkPassRef,
    }),
    []
  );

  // Hide until mode is loaded so OFF bots never flash the test-case rail.
  const showTestCaseRail =
    modeHydrated && shouldShowTestCaseRail(assistedAuthoringMode);

  // Mode-aware spotlight tour: while OFF, omit assisted-only steps (Task 3.6)
  const spotlightSteps = useMemo(
    () => filterSpotlightStepsForMode(EDITOR_SPOTLIGHT_STEPS, assistedAuthoringMode),
    [assistedAuthoringMode]
  );
  const spotlightStepCount = spotlightSteps.length;
  const spotlightStepId =
    editorSpotlightStep !== null
      ? spotlightSteps[editorSpotlightStep]?.id ?? null
      : null;

  useEffect(() => {
    async function loadApp() {
      try {
        const res = await fetch(`/api/apps/${appId}`);
        const body = await res.json();
        if (res.ok && body?.app) {
          setAppName(body.app.name || appId);
          setAssistedAuthoringMode(resolveAssistedAuthoringMode(body.app));
          setModeHydrated(true); // Mark as hydrated after first successful load
          if (body.app.provider && body.app.model) {
            setHeaderModelLabel(getModelLabel(body.app.provider, body.app.model));
          }
          setHeaderVariabilityLabel(
            formatVariabilityLabel(normalizeVariability(body.app.variability))
          );
          setIsPublished(Boolean(body.app.publishedAt));
          setProjectShareVisibility(body.app.projectShareVisibility || "private");
          setShareAuthorName(body.app.shareAuthorName ?? false);
          setCommunitySubject(body.app.communitySubject || "General");
          setCommunityTagsInput((body.app.communityTags || []).join(", "));
          setForkedFromProjectName(body.app.forkedFromProjectName || "");
          setForkedFromAuthorName(body.app.forkedFromAuthorName || "");
          setForkedFromProjectShareSlug(body.app.forkedFromProjectShareSlug || "");
          const serverPrompt =
            (typeof body.app.systemPrompt === "string"
              ? body.app.systemPrompt.trim()
              : "") ||
            (typeof body.app.description === "string"
              ? body.app.description.trim()
              : "");
          const localDraft = readStoredPrompt(appId);
          if (
            serverPrompt &&
            (!localDraft.trim() || isDefaultInstructionPrompt(localDraft))
          ) {
            saveStoredPrompt(serverPrompt, appId);
          }
          return;
        }
      } catch {}

      // Fetch failed or returned no app: still hydrate so mode-gated UI
      // (test-case rail, spotlight) is not stuck hidden forever. Unknown mode
      // keeps the client default (ON / legacy), matching resolveAssistedAuthoringMode.
      setAppName(appId);
      setHeaderModelLabel("Unknown model");
      setHeaderVariabilityLabel(formatVariabilityLabel());
      setModeHydrated(true);
    }

    void loadApp();
  }, [appId, appVersion]);

  // Unified mode transition handler: ON→OFF persist, OFF→ON restore/regenerate (Tasks 3.4, 3.5).
  // Sequencing: ignore pre-hydration runs; seed ref with the first hydrated value without
  // any action; only handle real transitions (ON→OFF or OFF→ON) from that baseline.
  useEffect(() => {
    if (!modeHydrated) return;

    const previousMode = previousAssistedAuthoringModeRef.current;

    // First hydration: seed ref without action
    if (previousMode === null) {
      previousAssistedAuthoringModeRef.current = assistedAuthoringMode;
      return;
    }

    // Handle ON→OFF transition: save snapshot before mode becomes false
    if (shouldPersistOnToOffTransition(true, previousMode, assistedAuthoringMode)) {
      const plan = planOnToOffTransition({
        appId,
        testCases: currentTestCasesSnapshot.testCases,
        finalPromptText: currentTestCasesSnapshot.finalPromptText,
      });

      if (plan.action === "save-and-hide") {
        try {
          saveAssistedAuthoringSnapshot(plan.snapshot);
          setSnapshotError("");
        } catch (error) {
          setSnapshotError(
            error instanceof Error ? error.message : String(error)
          );
        }
      } else if (plan.action === "error") {
        setSnapshotError(plan.reason);
      }
    }

    // Handle OFF→ON transition: restore or regenerate test cases
    if (shouldPersistOffToOnTransition(true, previousMode, assistedAuthoringMode)) {
      const currentFinalPrompt = readStoredPrompt(appId);
      const plan = planOffToOnTransition({
        appId,
        currentFinalPrompt,
      });

      setOffToOnError("");

      if (plan.action === "restore") {
        // Restore preserved test cases from snapshot
        setOffToOnBootstrapAction({
          action: "restore",
          testCases: plan.snapshot.testCases,
        });
      } else {
        // Regenerate test cases (fingerprint mismatch or missing snapshot)
        setOffToOnBootstrapAction({
          action: "regenerate",
        });
      }
    }

    // Update ref after handling all transitions
    previousAssistedAuthoringModeRef.current = assistedAuthoringMode;
  }, [assistedAuthoringMode, modeHydrated, appId, currentTestCasesSnapshot]);

  useEffect(() => {
    setModeHydrated(false);
    previousAssistedAuthoringModeRef.current = null;
    setCurrentTestCasesSnapshot({ testCases: [], finalPromptText: "" });
    setOffToOnBootstrapAction(null);
    setOffToOnError("");
  }, [appId]);

  async function handlePublish() {
    const gateResult = shouldBlockPublishForTestCases(assistedAuthoringMode, testCaseStatus);
    
    if (gateResult.shouldBlock) {
      setPublishUrl("");
      setPublishError(gateResult.reason || "Cannot publish at this time.");
      setPublishOpen(true);
      return;
    }

    setPublishBusy(true);
    setPublishError("");

    try {
      const systemPrompt =
        typeof window !== "undefined"
          ? readStoredPrompt(appId)
          : "";

      const res = await fetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          publish: true,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to publish app");
      }

      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";
      const publicIdentifier = body?.app?.publicSlug || appId;
      setPublishUrl(`${baseUrl}/chat/${publicIdentifier}`);
      setIsPublished(true);
      setPublishOpen(true);
      setAppVersion((value) => value + 1);
    } catch (e: any) {
      setPublishError(e?.message || "Failed to publish app");
      setPublishOpen(true);
    } finally {
      setPublishBusy(false);
    }
  }

  async function saveProjectSharing(settings?: {
    projectShareVisibility?: "private" | "public";
    shareAuthorName?: boolean;
  }) {
    setShareBusy(true);
    setShareError("");
    setChatbotShareError("");

    try {
      // Editor / My bots share omits workspaceId so permission (c) does not apply.
      // Workspace hub (task 6.2) will pass workspaceId into ShareDialog + PATCH.
      const res = await fetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildEducatorSharePatchBody({
            projectShareVisibility:
              settings?.projectShareVisibility ?? projectShareVisibility,
            shareAuthorName: settings?.shareAuthorName ?? shareAuthorName,
            communitySubject,
            communityTagsInput,
          })
        ),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          educatorSharePatchErrorMessage(res.status, body?.error)
        );
      }

      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";

      const projectIdentifier = body?.app?.projectShareSlug;
      const chatbotIdentifier = body?.app?.publicSlug;
      setProjectShareUrl(
        projectIdentifier ? `${baseUrl}/project/${projectIdentifier}` : ""
      );
      setProjectShareVisibility(body?.app?.projectShareVisibility || "private");
      setShareAuthorName(body?.app?.shareAuthorName ?? false);

      if (body?.app?.publishedAt && chatbotIdentifier) {
        setChatbotShareUrl(`${baseUrl}/chat/${chatbotIdentifier}`);
        setChatbotShareError("");
      } else {
        setChatbotShareUrl("");
        setChatbotShareError(
          "Publish this bot first if you want to share the student chatbot link."
        );
      }

      setAppVersion((value) => value + 1);
    } catch (e: any) {
      setShareError(e?.message || "Failed to prepare share links");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleShare() {
    setShareOpen(true);
    await saveProjectSharing({
      projectShareVisibility,
      shareAuthorName,
    });
  }

  useEffect(() => {
    if (!resizingPanel) return;

    function handlePointerMove(event: PointerEvent) {
      if (resizingPanel === "editor-testcases") {
        const container = splitPaneRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const nextWidth = ((event.clientX - rect.left) / rect.width) * 100;
        setEditorPaneWidth(Math.min(75, Math.max(35, nextWidth)));
        return;
      }

      const container = assistantSplitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nextWidth = ((event.clientX - rect.left) / rect.width) * 100;
      setAssistantPaneWidth(Math.min(55, Math.max(22, nextWidth)));
    }

    function handlePointerUp() {
      setResizingPanel(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingPanel]);

  // Wait for mode hydration so OFF bots never start the assisted-only tour as mandatory.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!modeHydrated) return;
    if (window.localStorage.getItem(editorSpotlightTourStorageKey(appId)) === "done") {
      setEditorSpotlightStep(null);
      return;
    }
    setEditorSpotlightStep(0);
  }, [appId, modeHydrated]);

  // If the filtered tour shrinks (e.g. mode → OFF), clamp the tour index.
  useEffect(() => {
    if (editorSpotlightStep === null) return;
    if (spotlightStepCount === 0) {
      setEditorSpotlightStep(null);
      return;
    }
    if (editorSpotlightStep >= spotlightStepCount) {
      setEditorSpotlightStep(spotlightStepCount - 1);
    }
  }, [editorSpotlightStep, spotlightStepCount]);

  useLayoutEffect(() => {
    if (editorSpotlightStep === null || spotlightStepId === null) {
      setEditorSpotlightRect(null);
      return;
    }
    const resolveNode = (): HTMLElement | null => {
      switch (spotlightStepId) {
        case 0:
          return spotlightPromptRef.current;
        case 1:
          return spotlightAttachmentRef.current;
        case 2:
          return spotlightAgentRef.current;
        case 3:
          return spotlightSimulatedChatRef.current;
        case 4:
          return spotlightCase0Ref.current;
        case 5:
          return spotlightCase1Ref.current || spotlightCase0Ref.current;
        case 6:
          return spotlightSimulatedChatRef.current;
        case 7:
          return spotlightApplyPromptRef.current;
        case 8:
          return spotlightAddCaseRef.current;
        case 9:
          return spotlightMarkPassRef.current;
        case 10:
          return publishSpotlightRef.current;
        default:
          return null;
      }
    };
    const update = () => {
      const el = resolveNode();
      if (!el) {
        setEditorSpotlightRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setEditorSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const el = resolveNode();
    const ro = new ResizeObserver(update);
    if (el) ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    editorSpotlightStep,
    spotlightStepId,
    assistantOpen,
    assistantPaneWidth,
    editorPaneWidth,
    appVersion,
    testCaseStatus.passedCount,
    testCaseStatus.totalCount,
    testCaseStatus.chatLayoutKey,
  ]);

  const replayEditorGuide = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(editorSpotlightTourStorageKey(appId));
    }
    setEditorSpotlightStep(0);
  }, [appId]);

  return (
    <EditorChrome
      appName={appName}
      modelLabel={headerModelLabel}
      variabilityLabel={headerVariabilityLabel}
      onShare={handleShare}
      shareBusy={shareBusy}
      shareDisabled={!isPublished}
      onPublish={() => {
        setPublishUrl("");
        setPublishError("");
        void handlePublish();
      }}
      publishBusy={publishBusy}
      publishButtonRef={publishSpotlightRef}
      onReplayEditorGuide={replayEditorGuide}
    >
      {forkedFromProjectName && (
        <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
          Forked from{" "}
          <span className="font-semibold">{forkedFromProjectName}</span>
          {forkedFromAuthorName ? ` by ${forkedFromAuthorName}` : ""}.
          {forkedFromProjectShareSlug && (
            <>
              {" "}
              <a
                href={`/project/${forkedFromProjectShareSlug}`}
                className="font-medium underline underline-offset-2"
              >
                View original project
              </a>
            </>
          )}
        </div>
      )}
      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="h-full w-14 shrink-0 overflow-hidden border-r border-slate-200 bg-white dark:border-zinc-800/90 dark:bg-zinc-900">
          <RightRail
            assistantOpen={assistantOpen}
            settingsOpen={settingsOpen}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        <div
          ref={assistantSplitRef}
          className={[
            "flex min-h-0 min-w-0 flex-1 overflow-hidden",
            resizingPanel === "assistant-main" ? "select-none cursor-col-resize" : "",
          ].join(" ")}
        >
          {assistantOpen && (
            <>
              <div
                className="h-full min-h-0 shrink-0 overflow-hidden bg-white dark:bg-zinc-900"
                style={{ width: `${assistantPaneWidth}%` }}
              >
                <LeftChat appId={appId} appVersion={appVersion} />
              </div>
              <PanelResizeHandle
                label="Resize assistant and prompt panels"
                active={resizingPanel === "assistant-main"}
                onPointerDown={() => setResizingPanel("assistant-main")}
              />
            </>
          )}

          <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
            {snapshotError && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 border-b border-red-200/80 bg-red-50/90 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <p className="leading-relaxed">
                  <span className="font-medium">Couldn’t preserve test cases.</span>{" "}
                  {snapshotError}
                </p>
                <button
                  type="button"
                  onClick={() => setSnapshotError("")}
                  className="shrink-0 rounded-md px-2 py-1 font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-red-100/80 active:scale-[0.97] dark:hover:bg-red-900/40"
                >
                  Dismiss
                </button>
              </div>
            )}
            {offToOnError && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 border-b border-red-200/80 bg-red-50/90 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <p className="leading-relaxed">
                  <span className="font-medium">Couldn’t restore test cases.</span>{" "}
                  {offToOnError}
                </p>
                <button
                  type="button"
                  onClick={() => setOffToOnError("")}
                  className="shrink-0 rounded-md px-2 py-1 font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-red-100/80 active:scale-[0.97] dark:hover:bg-red-900/40"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div
              ref={splitPaneRef}
              className={[
                "flex h-full min-h-0 w-full overflow-hidden",
                resizingPanel === "editor-testcases" ? "select-none cursor-col-resize" : "",
              ].join(" ")}
            >
              <div
                className="h-full min-h-0 shrink-0 overflow-hidden"
                style={showTestCaseRail ? { width: `${editorPaneWidth}%` } : { width: "100%" }}
              >
                <InstructionDoc
                  spotlightPromptRef={spotlightPromptRef}
                  spotlightAttachmentRef={spotlightAttachmentRef}
                  spotlightAgentRef={spotlightAgentRef}
                  spotlightApplyPromptRef={spotlightApplyPromptRef}
                />
              </div>
              {showTestCaseRail && (
                <>
                  <PanelResizeHandle
                    label="Resize editor and test cases panels"
                    active={resizingPanel === "editor-testcases"}
                    onPointerDown={() => setResizingPanel("editor-testcases")}
                  />
                  <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white dark:bg-zinc-950">
                    <AssistantPanel
                      appId={appId}
                      appName={appName}
                      appVersion={appVersion}
                      assistedAuthoringMode={assistedAuthoringMode}
                      spotlightTargetRefs={spotlightTargetRefs}
                      onTestCaseStatusChange={setTestCaseStatus}
                      onTestCasesSnapshotReady={setCurrentTestCasesSnapshot}
                      offToOnBootstrapAction={offToOnBootstrapAction}
                      onOffToOnBootstrapComplete={() => setOffToOnBootstrapAction(null)}
                      onOffToOnError={(error) => setOffToOnError(error)}
                    />
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <AppSettingsDialog
        appId={appId}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setAppVersion((value) => value + 1);
          setSettingsOpen(false);
        }}
      />
      <PublishDialog
        open={publishOpen}
        url={publishUrl}
        error={publishError}
        onClose={() => setPublishOpen(false)}
      />
      <ShareDialog
        open={shareOpen}
        appName={appName}
        loading={shareBusy}
        savingSettings={shareBusy}
        error={shareError}
        projectUrl={projectShareUrl}
        chatbotUrl={chatbotShareUrl}
        chatbotError={chatbotShareError}
        projectShareVisibility={projectShareVisibility}
        shareAuthorName={shareAuthorName}
        subject={communitySubject}
        tagsInput={communityTagsInput}
        onProjectShareVisibilityChange={setProjectShareVisibility}
        onShareAuthorNameChange={setShareAuthorName}
        onSubjectChange={setCommunitySubject}
        onTagsInputChange={setCommunityTagsInput}
        onSaveProjectSettings={() => {
          void saveProjectSharing({
            projectShareVisibility,
            shareAuthorName,
          });
        }}
        onClose={() => {
          if (shareBusy) return;
          setShareOpen(false);
          setShareError("");
        }}
      />

      {editorSpotlightStep !== null &&
        spotlightStepId !== null &&
        spotlightStepCount > 0 && (
        <EditorTestcaseSpotlight
          show
          holeRect={editorSpotlightRect}
          title={editorSpotlightTourTitle(spotlightStepId)}
          body={editorSpotlightTourBody(spotlightStepId)}
          stepIndex={editorSpotlightStep}
          stepCount={spotlightStepCount}
          primaryLabel={
            editorSpotlightStep < spotlightStepCount - 1
              ? "Next"
              : "Okay, I understand"
          }
          onPrimary={() => {
            if (editorSpotlightStep === null) return;
            if (editorSpotlightStep < spotlightStepCount - 1) {
              setEditorSpotlightStep(editorSpotlightStep + 1);
            } else {
              window.localStorage.setItem(editorSpotlightTourStorageKey(appId), "done");
              setEditorSpotlightStep(null);
            }
          }}
        />
      )}
    </EditorChrome>
  );
}