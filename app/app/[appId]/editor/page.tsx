"use client";
import { use, useEffect, useRef, useState } from "react";
import EditorChrome from "@/components/editor/EditorChrome";
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
  });
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
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const splitPaneRef = useRef<HTMLDivElement>(null);

  const gridCols = assistantOpen
    ? "grid-cols-1 xl:grid-cols-[88px_1.05fr_minmax(0,1fr)]"
    : "grid-cols-1 xl:grid-cols-[88px_minmax(0,1fr)]";

  useEffect(() => {
    async function loadApp() {
      try {
        const res = await fetch(`/api/apps/${appId}`);
        const body = await res.json();
        if (res.ok && body?.app) {
          setAppName(body.app.name || appId);
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

      setAppName(appId);
      setHeaderModelLabel("Unknown model");
      setHeaderVariabilityLabel(formatVariabilityLabel());
    }

    void loadApp();
  }, [appId, appVersion]);

  async function handlePublish() {
    if (!testCaseStatus.allPassed) {
      setPublishUrl("");
      setPublishError(
        testCaseStatus.totalCount > 0
          ? `Mark all test cases as pass before publishing. ${testCaseStatus.passedCount} of ${testCaseStatus.totalCount} passed so far.`
          : "Add and pass at least one test case before publishing."
      );
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
      const res = await fetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareProject: true,
          projectShareVisibility:
            settings?.projectShareVisibility ?? projectShareVisibility,
          shareAuthorName: settings?.shareAuthorName ?? shareAuthorName,
          communitySubject,
          communityTags: communityTagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to prepare share links");
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
    if (!isResizingPanels) return;

    function handlePointerMove(event: PointerEvent) {
      const container = splitPaneRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const nextWidth = ((event.clientX - rect.left) / rect.width) * 100;
      const clampedWidth = Math.min(75, Math.max(35, nextWidth));
      setEditorPaneWidth(clampedWidth);
    }

    function handlePointerUp() {
      setIsResizingPanels(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingPanels]);

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
      <div
        className={`grid h-full min-h-0 overflow-hidden ${gridCols} gap-0 divide-x divide-slate-200 dark:divide-zinc-800/90`}
      >
        <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-900">
          <RightRail
            assistantOpen={assistantOpen}
            settingsOpen={settingsOpen}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {assistantOpen && (
          <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-900">
            <LeftChat appId={appId} appVersion={appVersion} />
          </div>
        )}

        <section className="flex h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-950">
          <div
            ref={splitPaneRef}
            className={[
              "flex h-full min-h-0 w-full overflow-hidden",
              isResizingPanels ? "select-none cursor-col-resize" : "",
            ].join(" ")}
          >
            <div
              className="h-full min-h-0 shrink-0 overflow-hidden"
              style={{ width: `${editorPaneWidth}%` }}
            >
              <InstructionDoc />
            </div>
            <div className="group relative flex w-3 shrink-0 items-stretch justify-center bg-white dark:bg-zinc-900">
              <div
                className={[
                  "h-full w-px bg-slate-200 transition dark:bg-zinc-700",
                  isResizingPanels ? "bg-sky-400 dark:bg-sky-500" : "group-hover:bg-slate-300 dark:group-hover:bg-zinc-600",
                ].join(" ")}
              />
              <button
                type="button"
                aria-label="Resize editor and test cases panels"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setIsResizingPanels(true);
                }}
                className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
              >
                <span
                  className={[
                    "absolute left-1/2 top-1/2 h-14 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition",
                    isResizingPanels
                      ? "bg-sky-400/80 dark:bg-sky-500/80"
                      : "bg-slate-200/0 group-hover:bg-slate-200 dark:group-hover:bg-zinc-600",
                  ].join(" ")}
                />
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white dark:bg-zinc-950">
              <AssistantPanel
                appId={appId}
                appName={appName}
                appVersion={appVersion}
                onTestCaseStatusChange={setTestCaseStatus}
              />
            </div>
          </div>
        </section>
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
    </EditorChrome>
  );
}