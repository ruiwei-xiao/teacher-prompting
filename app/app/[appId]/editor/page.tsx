"use client";
import { use, useEffect, useState } from "react";
import EditorChrome from "@/components/editor/EditorChrome";
import LeftChat from "@/components/editor/LeftChat";
import InstructionDoc from "@/components/editor/InstructionDoc";
import RightRail from "@/components/editor/RightRail";
import AssistantPanel from "@/components/editor/AssistantPanel";
import AppSettingsDialog from "@/components/editor/AppSettingsDialog";
import PublishDialog from "@/components/editor/PublishDialog";
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
  const [assistantOpen, setAssistantOpen] = useState(true);
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

  return (
    <EditorChrome
      appName={appName}
      modelLabel={headerModelLabel}
      variabilityLabel={headerVariabilityLabel}
      onPublish={handlePublish}
      publishBusy={publishBusy}
    >
      <div className={`h-full grid ${gridCols} gap-0 divide-x divide-slate-200`}>
        <div className="h-full bg-white">
          <RightRail
            assistantOpen={assistantOpen}
            settingsOpen={settingsOpen}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {assistantOpen && (
          <div className="h-full bg-white">
            <LeftChat appId={appId} appVersion={appVersion} />
          </div>
        )}

        <section className="h-full bg-white flex flex-col">
          <div className="min-h-0 flex-1">
            <InstructionDoc />
          </div>
        </section>

        <div className="h-full bg-white">
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
    </EditorChrome>
  );
}