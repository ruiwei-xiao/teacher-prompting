"use client";

import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { Provider } from "@lexical/yjs";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useRoom,
  useSelf,
} from "@liveblocks/react/suspense";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from "lexical";
import { useCallback } from "react";
import * as Y from "yjs";
import {
  DOC_YJS_KEYS,
  LIVEBLOCKS_AUTH_ENDPOINT,
  cursorIdentity,
  liveblocksRoomId,
  sharedDocPlaceholder,
  sharedDocTitle,
  type SharedDocKey,
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

function CollaborativeDoc({ docKey }: { docKey: SharedDocKey }) {
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
        </div>
      </LexicalComposer>
    </div>
  );
}

function SharedDocsBody() {
  return (
    <div className="flex flex-col gap-4">
      {DOC_YJS_KEYS.map((docKey) => (
        <CollaborativeDoc key={docKey} docKey={docKey} />
      ))}
    </div>
  );
}

export default function SharedDocEditor({ teamId }: { teamId: string }) {
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
      <div className="mt-4">
        <LiveblocksProvider authEndpoint={LIVEBLOCKS_AUTH_ENDPOINT}>
          <RoomProvider id={liveblocksRoomId(teamId)} initialPresence={{}}>
            <ClientSideSuspense
              fallback={
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Loading shared documents…
                </p>
              }
            >
              <SharedDocsBody />
            </ClientSideSuspense>
          </RoomProvider>
        </LiveblocksProvider>
      </div>
    </section>
  );
}
