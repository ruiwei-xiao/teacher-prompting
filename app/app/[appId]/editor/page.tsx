"use client";
import { use, useEffect, useState } from "react";
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

  const gridCols = assistantOpen
    ? "grid-cols-1 xl:grid-cols-[88px_1.05fr_1.6fr_1.05fr]"
    : "grid-cols-1 xl:grid-cols-[88px_1.7fr_1.05fr]";

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
          setProjectShareVisibility(body.app.projectShareVisibility || "private");
          setShareAuthorName(body.app.shareAuthorName ?? false);
          setForkedFromProjectName(body.app.forkedFromProjectName || "");
          setForkedFromAuthorName(body.app.forkedFromAuthorName || "");
          setForkedFromProjectShareSlug(body.app.forkedFromProjectShareSlug || "");
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
    setPublishBusy(true);
    setPublishError("");

    try {
      const systemPrompt =
        typeof window !== "undefined"
          ? localStorage.getItem("instruction-doc-md") || ""
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

  return (
    <EditorChrome
      appName={appName}
      modelLabel={headerModelLabel}
      variabilityLabel={headerVariabilityLabel}
      onShare={handleShare}
      shareBusy={shareBusy}
      onPublish={handlePublish}
      publishBusy={publishBusy}
    >
      {forkedFromProjectName && (
        <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
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
      <div className={`grid h-full min-h-0 overflow-hidden ${gridCols} gap-0 divide-x divide-slate-200`}>
        <div className="h-full min-h-0 overflow-hidden bg-white">
          <RightRail
            assistantOpen={assistantOpen}
            settingsOpen={settingsOpen}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {assistantOpen && (
          <div className="h-full min-h-0 overflow-hidden bg-white">
            <LeftChat appId={appId} appVersion={appVersion} />
          </div>
        )}

        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
          <div className="min-h-0 flex-1 overflow-hidden">
            <InstructionDoc />
          </div>
        </section>

        <div className="h-full min-h-0 overflow-hidden bg-white">
          <AssistantPanel
            appId={appId}
            appName={appName}
            appVersion={appVersion}
          />
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
        onProjectShareVisibilityChange={setProjectShareVisibility}
        onShareAuthorNameChange={setShareAuthorName}
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