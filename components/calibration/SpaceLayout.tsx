"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Bot,
  ClipboardList,
  FileText,
  FolderOpen,
  MessagesSquare,
  X,
} from "lucide-react";
import ActivityBotPane from "./ActivityBotPane";
import ArtifactsPanel from "./ArtifactsPanel";
import FinalDeliverable from "./FinalDeliverable";
import GroupChatPanel from "./GroupChatPanel";
import { lucideMd, lucideSm } from "./lucide";
import ReadyBar from "./ReadyBar";
import ScoreSheet from "./ScoreSheet";
import SharedDocEditor from "./SharedDocEditor";
import SpaceChrome from "./SpaceChrome";
import type { ArtifactsView } from "@/lib/calibration-ui/artifacts";
import { labelForUserId } from "@/lib/auth/user-label";
import { type DeliverableSnapshot } from "@/lib/calibration-ui/deliverable";
import type { SharedDocSnapshots } from "@/lib/calibration-ui/docs";
import {
  SPACE_POLL_MS,
  SPACE_VISIBLE_POLL_MS,
  currentRoundRoleLabel,
  parseSpaceResponse,
  phaseBannerLabel,
  retainVisitRecap,
  spaceApiHref,
  type SpaceView,
} from "@/lib/calibration-ui/space";

type Overlay = "none" | "artifacts" | "scores" | "deliverable";
type Pane = "chat" | "docs" | "bot";

export type SpaceAbsence = {
  userId: string;
  stepKey: string;
  markedAt: string;
};

function RailButton({
  label,
  shortLabel,
  hint,
  icon,
  active = false,
  attention = false,
  onClick,
}: {
  label: string;
  shortLabel: string;
  hint: string;
  icon: ReactNode;
  active?: boolean;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}. ${hint}`}
      aria-pressed={active}
      title={`${label} — ${hint}`}
      className={[
        "flex w-12 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5",
        "transition-[background-color,color,transform] duration-150 ease-out",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
        active
          ? "bg-sky-600 text-white dark:bg-sky-500"
          : attention
            ? "bg-sky-50 text-sky-800 ring-2 ring-sky-400 hover:bg-sky-100 dark:bg-sky-950/70 dark:text-sky-100 dark:ring-sky-500"
            : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/90 hover:bg-slate-50 hover:text-slate-900 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {icon}
      <span className="text-[9px] font-semibold leading-none tracking-wide">
        {shortLabel}
      </span>
    </button>
  );
}

function OverlayFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16 dark:bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100dvh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-xl dark:border-zinc-700 dark:bg-zinc-900/90"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-[transform,background-color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X {...lucideSm} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

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
    <div className="group relative flex w-3 shrink-0 items-stretch justify-center bg-slate-50 dark:bg-zinc-950">
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
          event.currentTarget.setPointerCapture(event.pointerId);
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

export default function SpaceLayout({
  teamId,
  viewerUserId,
  title,
  initialSpace,
  artifacts,
  criterionKeys,
  deliverable,
  snapshots,
  sampleBot,
  backHref = "/activity",
  backAriaLabel = "Back to activities",
  absences = [],
}: {
  teamId: string;
  viewerUserId: string;
  title: string;
  initialSpace: SpaceView;
  artifacts: ArtifactsView;
  criterionKeys: string[];
  deliverable: DeliverableSnapshot;
  snapshots: SharedDocSnapshots;
  sampleBot: {
    appId: string;
    appName: string;
    modelLabel: string;
  };
  backHref?: string;
  backAriaLabel?: string;
  absences?: SpaceAbsence[];
}) {
  const [space, setSpace] = useState<SpaceView>(initialSpace);
  const [chatOpen, setChatOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);
  const [botOpen, setBotOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(32);
  const [docsWidth, setDocsWidth] = useState(36);
  const [resizing, setResizing] = useState<"chat-docs" | "docs-bot" | "chat-bot" | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [mounted, setMounted] = useState(false);
  const roleLabel =
    space.role === "operator"
      ? "a viewer"
      : currentRoundRoleLabel(space, viewerUserId);
  const deliverableLocked = space.locked || space.phase === "finalized";
  const scoreAttention =
    space.role === "member" &&
    overlay !== "scores" &&
    ((space.phase === "scoring" &&
      !space.submittedBy.includes(viewerUserId)) ||
      (Boolean(space.revealedAt) &&
        (space.phase === "discussion" ||
          space.phase === "consensus" ||
          space.phase === "scoring")));
  const finalAttention =
    deliverableLocked && overlay !== "deliverable";
  const openCount = Number(chatOpen) + Number(docsOpen) + Number(botOpen);
  const botWeight = Math.max(18, 100 - chatWidth - docsWidth);
  const totalWeight =
    (chatOpen ? chatWidth : 0) +
    (docsOpen ? docsWidth : 0) +
    (botOpen ? botWeight : 0) || 1;
  const chatPaneWidth = `${((chatWidth / totalWeight) * 100).toFixed(2)}%`;
  const docsPaneWidth = `${((docsWidth / totalWeight) * 100).toFixed(2)}%`;
  const botPaneWidth = `${((botWeight / totalWeight) * 100).toFixed(2)}%`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = 0;

    async function refetch() {
      const res = await fetch(spaceApiHref(teamId));
      const body = await res.json().catch(() => ({}));
      const parsed = parseSpaceResponse(res.status, body);
      if (!cancelled && parsed.ok) {
        setSpace((previous) => retainVisitRecap(previous, parsed.space));
      }
    }

    function pollDelay() {
      return document.visibilityState === "hidden"
        ? SPACE_POLL_MS
        : SPACE_VISIBLE_POLL_MS;
    }

    function startInterval() {
      window.clearInterval(intervalId);
      intervalId = window.setInterval(() => {
        void refetch();
      }, pollDelay());
    }

    startInterval();

    function onFocus() {
      void refetch();
    }
    function onVisibility() {
      startInterval();
      if (document.visibilityState === "visible") void refetch();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [teamId]);

  useEffect(() => {
    if (!resizing) return;

    function handlePointerMove(event: PointerEvent) {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const min = 18;
      if (resizing === "chat-docs") {
        const max = chatOpen && docsOpen ? 100 - (botOpen ? 100 - chatWidth - docsWidth : 0) - min : 82;
        const nextChat = Math.min(Math.max(x, min), Math.max(min, max));
        const delta = nextChat - chatWidth;
        setChatWidth(nextChat);
        setDocsWidth((current) => Math.max(min, current - delta));
        return;
      }
      if (resizing === "docs-bot") {
        const docsStart = chatOpen ? chatWidth : 0;
        const nextDocs = Math.min(Math.max(x - docsStart, min), 100 - docsStart - min);
        setDocsWidth(nextDocs);
        return;
      }
      const nextChat = Math.min(Math.max(x, min), 100 - min);
      setChatWidth(nextChat);
    }

    function handlePointerUp() {
      setResizing(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [chatOpen, chatWidth, docsOpen, docsWidth, resizing]);

  function togglePane(pane: Pane) {
    if (pane === "chat") {
      if (chatOpen && openCount === 1) return;
      setChatOpen((value) => !value);
      return;
    }
    if (pane === "docs") {
      if (docsOpen && openCount === 1) return;
      setDocsOpen((value) => !value);
      return;
    }
    if (botOpen && openCount === 1) return;
    setBotOpen((value) => !value);
  }

  function onSpace(next: SpaceView) {
    setSpace((previous) => retainVisitRecap(previous, next));
  }

  return (
    <SpaceChrome
      title={title}
      phaseLabel={phaseBannerLabel(space)}
      roleLabel={roleLabel}
      backHref={backHref}
      backAriaLabel={backAriaLabel}
    >
      <aside className="flex h-full w-16 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 px-1.5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-1.5">
          <RailButton
            active={chatOpen}
            onClick={() => togglePane("chat")}
            label="Group chat"
            shortLabel="Chat"
            hint={chatOpen ? "Hide group chat" : "Show group chat"}
            icon={<MessagesSquare {...lucideMd} />}
          />
          <RailButton
            active={docsOpen}
            onClick={() => togglePane("docs")}
            label="Shared documents"
            shortLabel="Docs"
            hint={docsOpen ? "Hide shared documents" : "Show shared documents"}
            icon={<FileText {...lucideMd} />}
          />
          <RailButton
            active={botOpen}
            onClick={() => togglePane("bot")}
            label="Try the sample bot"
            shortLabel="Try"
            hint={botOpen ? "Hide sample bot" : "Show sample bot"}
            icon={<Bot {...lucideMd} />}
          />
          <RailButton
            active={overlay === "artifacts"}
            onClick={() =>
              setOverlay((current) =>
                current === "artifacts" ? "none" : "artifacts"
              )
            }
            label="Sample materials"
            shortLabel="Files"
            hint="Read-only prompt, rubric, brief, and transcript"
            icon={<FolderOpen {...lucideMd} />}
          />
          <RailButton
            active={overlay === "scores"}
            attention={scoreAttention}
            onClick={() =>
              setOverlay((current) => (current === "scores" ? "none" : "scores"))
            }
            label="Scores"
            shortLabel="Score"
            hint={
              space.role === "operator"
                ? "View scores, including values still hidden from members"
                : "Score the sample against the shared rubric"
            }
            icon={<ClipboardList {...lucideMd} />}
          />
          {deliverableLocked ? (
            <RailButton
              active={overlay === "deliverable"}
              attention={finalAttention}
              onClick={() =>
                setOverlay((current) =>
                  current === "deliverable" ? "none" : "deliverable"
                )
              }
              label="Final deliverable"
              shortLabel="Final"
              hint="Locked group rubric and personal notes"
              icon={<BadgeCheck {...lucideMd} />}
            />
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Recap since last visit is the group chat history (requirement 3.2). */}

        <div
          ref={splitRef}
          className={[
            "flex min-h-0 flex-1 overflow-hidden bg-slate-50 p-3 dark:bg-zinc-950",
            resizing ? "select-none cursor-col-resize" : "",
          ].join(" ")}
        >
          {chatOpen ? (
            <div
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              style={openCount > 1 ? { width: chatPaneWidth } : { width: "100%" }}
            >
              <GroupChatPanel
                teamId={teamId}
                viewerUserId={viewerUserId}
                space={space}
                onPosted={onSpace}
                onOpenScores={() => setOverlay("scores")}
                onOpenDeliverable={() => setOverlay("deliverable")}
              />
            </div>
          ) : null}

          {chatOpen && docsOpen ? (
            <PanelResizeHandle
              label="Resize group chat and shared documents"
              active={resizing === "chat-docs"}
              onPointerDown={() => setResizing("chat-docs")}
            />
          ) : null}

          {chatOpen && !docsOpen && botOpen ? (
            <PanelResizeHandle
              label="Resize group chat and sample bot"
              active={resizing === "chat-bot"}
              onPointerDown={() => setResizing("chat-bot")}
            />
          ) : null}

          {docsOpen ? (
            <div
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              style={openCount > 1 ? { width: docsPaneWidth } : { width: "100%" }}
            >
              <div className="min-h-0 flex-1 overflow-hidden">
                <SharedDocEditor
                  teamId={teamId}
                  locked={deliverableLocked}
                  role={space.role}
                  snapshots={snapshots}
                />
              </div>
              <ReadyBar
                teamId={teamId}
                viewerUserId={viewerUserId}
                space={space}
                onSpace={onSpace}
              />
            </div>
          ) : null}

          {docsOpen && botOpen ? (
            <PanelResizeHandle
              label="Resize shared documents and sample bot"
              active={resizing === "docs-bot"}
              onPointerDown={() => setResizing("docs-bot")}
            />
          ) : null}

          {botOpen ? (
            <div
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              style={openCount > 1 ? { width: botPaneWidth } : { width: "100%" }}
            >
              <ActivityBotPane
                teamId={teamId}
                appId={sampleBot.appId}
                appName={sampleBot.appName}
                modelLabel={sampleBot.modelLabel}
              />
            </div>
          ) : null}
        </div>
      </div>

      {mounted && overlay === "artifacts"
        ? createPortal(
            <OverlayFrame
              title="Sample materials"
              onClose={() => setOverlay("none")}
            >
              <ArtifactsPanel artifacts={artifacts} />
            </OverlayFrame>,
            document.body
          )
        : null}

      {mounted && overlay === "scores"
        ? createPortal(
            <OverlayFrame title="Scores" onClose={() => setOverlay("none")}>
              {space.role === "operator" && !space.revealedAt ? (
                <p className="mb-3 text-sm text-slate-600 dark:text-zinc-400">
                  Held scores — members cannot see these values yet.
                </p>
              ) : null}
              <ScoreSheet
                teamId={teamId}
                viewerUserId={viewerUserId}
                space={space}
                criterionKeys={criterionKeys}
                onSpace={onSpace}
              />
              {space.role === "operator" ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/80">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                    Absences
                  </h3>
                  {absences.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
                      No absence marks.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-zinc-300">
                      {absences.map((row) => (
                        <li key={`${row.userId}:${row.stepKey}:${row.markedAt}`}>
                          {labelForUserId(row.userId, space.labels)} ·{" "}
                          {row.stepKey} · {row.markedAt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </OverlayFrame>,
            document.body
          )
        : null}

      {mounted && overlay === "deliverable"
        ? createPortal(
            <OverlayFrame
              title="Final deliverable"
              onClose={() => setOverlay("none")}
            >
              <FinalDeliverable
                teamId={teamId}
                viewerUserId={viewerUserId}
                role={space.role}
                locked={deliverableLocked}
                autoFinalized={deliverable.autoFinalized}
                rubricText={deliverable.rubricText}
                flaggedCriteria={deliverable.flaggedCriteria}
                initialAddenda={deliverable.addenda}
                labels={space.labels}
              />
            </OverlayFrame>,
            document.body
          )
        : null}
    </SpaceChrome>
  );
}
