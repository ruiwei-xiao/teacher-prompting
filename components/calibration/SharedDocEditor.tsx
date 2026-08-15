"use client";

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

  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
      // Room-level host stays shared for sync; each CollaborationPlugin
      // receives a dedicated provider/doc/awareness so disconnect() and
      // cursors cannot tear down or overwrite the sibling document.
      const roomProvider = getYjsProviderForRoom(room, {
        autoloadSubdocs: true,
      });
      return createSharedDocProvider(id, yjsDocMap, roomProvider, room);
    },
    [room]
  );

  const title = sharedDocTitle(docKey);
  const placeholder = sharedDocPlaceholder(docKey);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-950/40">
      <h3 className="border-b border-slate-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
        {title}
      </h3>
      <LexicalComposer initialConfig={editorConfig(docKey)}>
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={title}
                className="min-h-[12rem] px-3 py-2 text-sm leading-6 text-slate-900 outline-none dark:text-zinc-100"
              />
            }
            placeholder={
              <p className="pointer-events-none absolute inset-x-3 top-2 text-sm text-slate-400 dark:text-zinc-500">
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
            initialEditorState={bootstrapEditorState}
          />
          <SnapshotPushPlugin
            teamId={teamId}
            docKey={docKey}
            enabled={canPush}
          />
        </div>
      </LexicalComposer>
    </div>
  );
}

function SharedDocsBody({
  teamId,
  canPush,
}: {
  teamId: string;
  canPush: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {DOC_YJS_KEYS.map((docKey) => (
        <CollaborativeDoc
          key={docKey}
          docKey={docKey}
          teamId={teamId}
          canPush={canPush}
        />
      ))}
    </div>
  );
}

function ReadOnlySnapshotDocs({ snapshots }: { snapshots: SharedDocSnapshots }) {
  return (
    <div className="flex flex-col gap-4">
      {DOC_YJS_KEYS.map((docKey) => {
        const title = sharedDocTitle(docKey);
        const text = snapshots[docKey];
        return (
          <div
            key={docKey}
            className="rounded-xl border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-950/40"
          >
            <h3 className="border-b border-slate-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
              {title}
            </h3>
            <div
              aria-label={title}
              aria-readonly="true"
              className="min-h-[12rem] whitespace-pre-wrap px-3 py-2 text-sm leading-6 text-slate-900 dark:text-zinc-100"
            >
              {text || "No snapshot saved yet."}
            </div>
          </div>
        );
      })}
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

  useErrorListener(() => {
    onDown();
  });

  useEffect(() => {
    if (isLiveblocksOutage({ status })) {
      onDown();
    }
  }, [onDown, status]);

  return null;
}

class LiveblocksErrorBoundary extends Component<
  { onDown: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onDown();
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
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
  const readOnly =
    shouldShowReadOnly({ locked, liveblocksDown }) || role === "operator";
  const canPush = canPushDocSnapshot({ locked, role }) && !liveblocksDown;

  return (
    <section
      aria-label="Shared documents"
      className="rounded-2xl border border-white/60 bg-white/70 px-4 py-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80"
    >
      <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
        Shared documents
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
        Edits and named cursors appear for teammates who have these documents
        open. No reload needed.
      </p>
      {liveblocksDown && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {LIVEBLOCKS_OUTAGE_BANNER}
        </p>
      )}
      <div className="mt-4">
        {readOnly ? (
          <ReadOnlySnapshotDocs snapshots={snapshots} />
        ) : (
          <LiveblocksErrorBoundary onDown={() => setLiveblocksDown(true)}>
            <LiveblocksProvider authEndpoint={LIVEBLOCKS_AUTH_ENDPOINT}>
              <RoomProvider id={liveblocksRoomId(teamId)} initialPresence={{}}>
                <ConnectionWatcher onDown={() => setLiveblocksDown(true)} />
                <ClientSideSuspense
                  fallback={
                    <p className="text-sm text-slate-500 dark:text-zinc-400">
                      Loading shared documents…
                    </p>
                  }
                >
                  <SharedDocsBody teamId={teamId} canPush={canPush} />
                </ClientSideSuspense>
              </RoomProvider>
            </LiveblocksProvider>
          </LiveblocksErrorBoundary>
        )}
      </div>
    </section>
  );
}
