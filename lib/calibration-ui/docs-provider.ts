/**
 * Per-document Lexical Yjs providers for rubric and notes (Task 6.2).
 * Intentionally does not import the calibration engine, store, or API modules.
 */
import type { Provider, ProviderAwareness, UserState } from "@lexical/yjs";
import * as Y from "yjs";

export type RoomYjsHost = {
  getYDoc(): Y.Doc;
  loadSubdoc(guid: string): boolean;
  connect(): void;
  disconnect(): void;
  destroy?: () => void;
  synced?: boolean;
  awareness?: ProviderAwareness;
  on(type: string, cb: (...args: unknown[]) => void): void;
  off(type: string, cb: (...args: unknown[]) => void): void;
};

export type AwarenessPresence = Record<string, unknown>;

export type AwarenessOther = {
  connectionId: number;
  presence: AwarenessPresence;
};

export type AwarenessRoom = {
  getPresence(): AwarenessPresence;
  getOthers(): readonly AwarenessOther[];
  getSelf(): { presence: AwarenessPresence } | null | undefined;
  updatePresence(patch: AwarenessPresence): void;
  events?: {
    others?: {
      subscribe: (cb: (event: unknown) => void) => () => void;
    };
  };
};

const DOC_AWARENESS_KEY = "__yjs_docs";

type ScopedAwarenessEntry = {
  clientID: number;
  state: UserState;
};

type ScopedAwarenessMap = Record<string, ScopedAwarenessEntry>;

function readScopedMap(presence: AwarenessPresence | undefined): ScopedAwarenessMap {
  const raw = presence?.[DOC_AWARENESS_KEY];
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw as ScopedAwarenessMap;
}

class DocScopedAwareness implements ProviderAwareness {
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeOthers?: () => void;

  constructor(
    private readonly room: AwarenessRoom,
    private readonly doc: Y.Doc,
    private readonly docId: string
  ) {
    this.unsubscribeOthers = this.room.events?.others?.subscribe(() => {
      this.emit();
    });
  }

  get clientID(): number {
    return this.doc.clientID;
  }

  getLocalState(): UserState | null {
    return readScopedMap(this.room.getPresence())[this.docId]?.state ?? null;
  }

  setLocalState(state: UserState | null): void {
    const presence = this.room.getSelf()?.presence ?? this.room.getPresence();
    const docs = { ...readScopedMap(presence) };
    if (state === null) {
      delete docs[this.docId];
    } else {
      docs[this.docId] = { clientID: this.doc.clientID, state };
    }
    this.room.updatePresence({ [DOC_AWARENESS_KEY]: docs });
    this.emit();
  }

  setLocalStateField(field: string, value: unknown): void {
    const current = this.getLocalState();
    this.setLocalState({
      ...(current ?? {
        anchorPos: null,
        color: "",
        focusing: false,
        focusPos: null,
        name: "",
        awarenessData: {},
      }),
      [field]: value,
    } as UserState);
  }

  getStates(): Map<number, UserState> {
    const states = new Map<number, UserState>();
    const local = this.getLocalState();
    if (local) {
      states.set(this.doc.clientID, local);
    }
    for (const other of this.room.getOthers()) {
      const entry = readScopedMap(other.presence)[this.docId];
      if (entry?.state && typeof entry.clientID === "number") {
        states.set(entry.clientID, entry.state);
      }
    }
    return states;
  }

  on(type: "update", cb: () => void): void {
    if (type === "update") {
      this.listeners.add(cb);
    }
  }

  off(type: "update", cb: () => void): void {
    if (type === "update") {
      this.listeners.delete(cb);
    }
  }

  destroy(): void {
    this.unsubscribeOthers?.();
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class DocScopedProvider implements Provider {
  readonly awareness: ProviderAwareness;
  private readonly ownsAwareness: boolean;
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();
  private readonly detachHost: () => void;

  constructor(
    private readonly roomProvider: RoomYjsHost,
    doc: Y.Doc,
    docId: string,
    room: AwarenessRoom
  ) {
    if (roomProvider.awareness) {
      // Liveblocks encodes Yjs awareness itself. Writing cursor
      // RelativePositions into presence is not JSON and Liveblocks
      // rejects it with "Invalid message format".
      this.awareness = roomProvider.awareness;
      this.ownsAwareness = false;
    } else {
      this.awareness = new DocScopedAwareness(room, doc, docId);
      this.ownsAwareness = true;
    }
    const forward = (type: string) => {
      const handler = (...args: unknown[]) => this.emit(type, args);
      this.roomProvider.on(type, handler);
      return () => this.roomProvider.off(type, handler);
    };
    const unsubs = ["sync", "status", "update", "reload"].map(forward);
    this.detachHost = () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  connect(): void {
    this.roomProvider.connect();
  }

  disconnect(): void {
    this.awareness.setLocalState(null);
    this.detachHost();
    if (this.ownsAwareness && "destroy" in this.awareness) {
      (this.awareness as DocScopedAwareness).destroy();
    }
    this.listeners.clear();
    // Never destroy/disconnect the Liveblocks host. CollaborationPlugin
    // calls disconnect() on Strict Mode remount; destroying the host
    // unsubscribes Yjs and leaves a dead local document.
  }

  on(type: "sync", cb: (isSynced: boolean) => void): void;
  on(type: "status", cb: (arg0: { status: string }) => void): void;
  on(type: "update", cb: (arg0: unknown) => void): void;
  on(type: "reload", cb: (doc: Y.Doc) => void): void;
  on(
    type: "sync" | "status" | "update" | "reload",
    cb: ((isSynced: boolean) => void) | ((arg0: { status: string }) => void) | ((arg0: unknown) => void) | ((doc: Y.Doc) => void)
  ): void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(cb as (...args: unknown[]) => void);
    this.listeners.set(type, bucket);
    // Liveblocks may already be synced before Lexical subscribes.
    if (type === "sync" && this.roomProvider.synced) {
      (cb as (isSynced: boolean) => void)(true);
    }
  }

  off(type: "sync", cb: (isSynced: boolean) => void): void;
  off(type: "update", cb: (arg0: unknown) => void): void;
  off(type: "status", cb: (arg0: { status: string }) => void): void;
  off(type: "reload", cb: (doc: Y.Doc) => void): void;
  off(
    type: "sync" | "status" | "update" | "reload",
    cb: ((isSynced: boolean) => void) | ((arg0: { status: string }) => void) | ((arg0: unknown) => void) | ((doc: Y.Doc) => void)
  ): void {
    this.listeners.get(type)?.delete(cb as (...args: unknown[]) => void);
  }

  private emit(type: string, args: unknown[]): void {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(...args);
    }
  }
}

function ensureDedicatedDoc(
  id: string,
  yjsDocMap: Map<string, Y.Doc>
): Y.Doc {
  let doc = yjsDocMap.get(id);
  if (!doc) {
    doc = new Y.Doc({ guid: id });
    yjsDocMap.set(id, doc);
  }
  return doc;
}

/**
 * Return a Lexical Provider bound to one shared-doc id.
 * Never returns the room-level Yjs host singleton.
 */
export function createSharedDocProvider(
  id: string,
  yjsDocMap: Map<string, Y.Doc>,
  roomProvider: RoomYjsHost,
  room: AwarenessRoom
): Provider {
  const doc = ensureDedicatedDoc(id, yjsDocMap);
  return new DocScopedProvider(roomProvider, doc, id, room);
}
