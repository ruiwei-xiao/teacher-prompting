"use client";

import { CollaborationContext } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { Provider } from "@lexical/yjs";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
  useLostConnectionListener,
  useRoom,
  useSelf,
  useStatus,
} from "@liveblocks/react/suspense";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from "lexical";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import {
  DOC_YJS_KEYS,
  LIVEBLOCKS_AUTH_ENDPOINT,
  LIVEBLOCKS_OUTAGE_BANNER,
  SNAPSHOT_DEBOUNCE_MS,
  canPushDocSnapshot,
  cursorIdentity,
  isLiveblocksOutage,
  liveblocksRoomId,
  sharedDocPlaceholder,
  sharedDocTitle,
  shouldShowReadOnly,
  snapshotApiHref,
  snapshotPostBody,
  type SharedDocKey,
  type SharedDocRole,
  type SharedDocSnapshots,
} from "@/lib/calibration-ui/docs";
import { createSharedDocProvider } from "@/lib/calibration-ui/docs-provider";

function bootstrapEditorState(_editor: LexicalEditor): void {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(""));
  root.append(paragraph);
}

function editorConfig(docKey: SharedDocKey) {
  return {
    editorState: null,
    namespace: `calibration-${docKey}`,
    nodes: [],
    onError: (error: Error) => {
      console.error(error);
    },
    theme: {
      paragraph: "mb-2",
    },
  };
}

function SnapshotPushPlugin({
  teamId,
  docKey,
  enabled,
}: {
  teamId: string;
  docKey: SharedDocKey;
  enabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let lastPosted: string | undefined;
    const unregister = editor.registerUpdateListener(({ editorState, tags }) => {
      if (tags.has("collaboration") || tags.has("historic")) return;
      const text = editorState.read(() => $getRoot().getTextContent());
      if (text === lastPosted) return;
      // Skip the empty Lexical bootstrap so it cannot reset the group clock.
      if (lastPosted === undefined && text === "") {
        lastPosted = "";
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastPosted = text;
        void fetch(snapshotApiHref(teamId, docKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshotPostBody(text)),
        });
      }, SNAPSHOT_DEBOUNCE_MS);
    });
    return () => {
      unregister();
      window.clearTimeout(timer);
    };
  }, [docKey, editor, enabled, teamId]);

  return null;
}

function CollaborativeDoc({
  docKey,
  teamId,
  canPush,
}: {
  docKey: SharedDocKey;
  teamId: string;
  canPush: boolean;
}) {
  const room = useRoom();
  const userInfo = useSelf((me) => me.info);
  const { username, cursorColor } = cursorIdentity(
    userInfo as { name?: string; color?: string } | null
  );
  const cursorsContainerRef = useRef<HTMLDivElement>(null);
  const collaboration = useRef({
    clientID: 0,
    color: cursorColor,
    isCollabActive: false,
    name: username,
    yjsDocMap: new Map<string, Y.Doc>(),
  }).current;
  collaboration.color = cursorColor;
  collaboration.name = username;

  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
      // Reuse the room's Liveblocks Yjs provider so Strict Mode remounts
      // do not destroy the document or drop the websocket subscription.
      const host = getYjsProviderForRoom(room);
      yjsDocMap.set(id, host.getYDoc());
      return createSharedDocProvider(id, yjsDocMap, host, room);
    },
    [room]
  );

  const title = sharedDocTitle(docKey);
  const placeholder = sharedDocPlaceholder(docKey);

  return (
    <CollaborationContext.Provider value={collaboration}>
      <LexicalComposer initialConfig={editorConfig(docKey)}>
        <div ref={cursorsContainerRef} className="relative min-h-full">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={title}
                className="min-h-[32rem] text-[15px] leading-7 text-slate-900 outline-none dark:text-zinc-100"
              />
            }
            placeholder={
              <p className="pointer-events-none absolute inset-x-0 top-0 text-[15px] leading-7 text-slate-400 dark:text-zinc-500">
                {placeholder}
              </p>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <CollaborationPlugin
            id={docKey}
            providerFactory={providerFactory}
            shouldBootstrap
            username={username}
            cursorColor={cursorColor}
            cursorsContainerRef={cursorsContainerRef}
            initialEditorState={bootstrapEditorState}
          />
          <SnapshotPushPlugin
            teamId={teamId}
            docKey={docKey}
            enabled={canPush}
          />
        </div>
      </LexicalComposer>
    </CollaborationContext.Provider>
  );
}

function SharedDocsBody({
  teamId,
  canPush,
  onDown,
}: {
  teamId: string;
  canPush: boolean;
  onDown: () => void;
}) {
  const [activeKey, setActiveKey] = useState<SharedDocKey>("rubric");
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8f9fa] dark:bg-zinc-950">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        {DOC_YJS_KEYS.map((docKey) => {
          const active = docKey === activeKey;
          return (
            <button
              key={docKey}
              type="button"
              onClick={() => setActiveKey(docKey)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                active
                  ? "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {sharedDocTitle(docKey)}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mx-auto min-h-full max-w-3xl rounded-sm bg-white px-4 py-4 shadow-[0_1px_3px_rgba(60,64,67,0.15)] dark:bg-zinc-900 dark:shadow-none">
          <RoomProvider
            key={activeKey}
            id={liveblocksRoomId(teamId, activeKey)}
            initialPresence={{}}
          >
            <ClientSideSuspense
              fallback={
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Loading shared documents…
                </p>
              }
            >
              <ConnectionWatcher onDown={onDown} />
              <CollaborativeDoc
                docKey={activeKey}
                teamId={teamId}
                canPush={canPush}
              />
            </ClientSideSuspense>
          </RoomProvider>
        </div>
      </div>
    </div>
  );
}

function ReadOnlySnapshotDocs({ snapshots }: { snapshots: SharedDocSnapshots }) {
  const [activeKey, setActiveKey] = useState<SharedDocKey>("rubric");
  const title = sharedDocTitle(activeKey);
  const text = snapshots[activeKey];
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8f9fa] dark:bg-zinc-950">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        {DOC_YJS_KEYS.map((docKey) => {
          const active = docKey === activeKey;
          return (
            <button
              key={docKey}
              type="button"
              onClick={() => setActiveKey(docKey)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                active
                  ? "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {sharedDocTitle(docKey)}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div
          aria-label={title}
          aria-readonly="true"
          className="mx-auto min-h-full max-w-3xl whitespace-pre-wrap rounded-sm bg-white px-4 py-4 text-[15px] leading-7 text-slate-900 shadow-[0_1px_3px_rgba(60,64,67,0.15)] dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none"
        >
          {text || "No snapshot saved yet."}
        </div>
      </div>
    </div>
  );
}

function ConnectionWatcher({ onDown }: { onDown: () => void }) {
  const status = useStatus();

  useLostConnectionListener((lostConnection) => {
    if (isLiveblocksOutage({ lostConnection })) {
      onDown();
    }
  });

  useErrorListener((error) => {
    console.error("Liveblocks room error:", error);
    const context = (
      error as { context?: { type?: string; code?: number } }
    ).context;
    if (
      isLiveblocksOutage({
        errorType: context?.type,
        errorCode: context?.code,
      })
    ) {
      onDown();
    }
  });

  useEffect(() => {
    if (isLiveblocksOutage({ status })) {
      onDown();
    }
  }, [onDown, status]);

  return null;
}

class LiveblocksErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): { hasError: boolean; message: string } {
    return { hasError: true, message: error.message || "Editor failed to start" };
  }

  componentDidCatch(error: Error): void {
    console.error("Shared document editor error:", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-6">
          <p className="text-sm text-slate-700 dark:text-zinc-200">
            The shared document editor hit an error. Liveblocks auth succeeded;
            retrying the editor.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            {this.state.message}
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SharedDocEditor({
  teamId,
  locked = false,
  role = "member",
  snapshots = { rubric: "", notes: "" },
}: {
  teamId: string;
  locked?: boolean;
  role?: SharedDocRole;
  snapshots?: SharedDocSnapshots;
}) {
  const [liveblocksDown, setLiveblocksDown] = useState(false);
  const [editorNonce, setEditorNonce] = useState(0);
  const readOnly =
    shouldShowReadOnly({ locked, liveblocksDown }) || role === "operator";
  const canPush = canPushDocSnapshot({ locked, role }) && !liveblocksDown;

  function retryLiveblocks(): void {
    setLiveblocksDown(false);
    setEditorNonce((nonce) => nonce + 1);
  }

  return (
    <section
      aria-label="Shared documents"
      className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950"
    >
      {liveblocksDown && (
        <p
          role="status"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {LIVEBLOCKS_OUTAGE_BANNER}{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={retryLiveblocks}
          >
            Retry
          </button>
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {readOnly ? (
          <ReadOnlySnapshotDocs snapshots={snapshots} />
        ) : (
          <LiveblocksErrorBoundary key={editorNonce}>
            <LiveblocksProvider
              authEndpoint={LIVEBLOCKS_AUTH_ENDPOINT}
              lostConnectionTimeout={8000}
            >
              <SharedDocsBody
                teamId={teamId}
                canPush={canPush}
                onDown={() => setLiveblocksDown(true)}
              />
            </LiveblocksProvider>
          </LiveblocksErrorBoundary>
        )}
      </div>
    </section>
  );
}
