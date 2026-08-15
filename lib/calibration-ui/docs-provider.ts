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
  readonly awareness: DocScopedAwareness;
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
    this.awareness = new DocScopedAwareness(room, doc, docId);
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
    this.awareness.destroy();
    this.listeners.clear();
  }

  on(
    type: "sync" | "status" | "update" | "reload",
    cb: (...args: unknown[]) => void
  ): void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(cb);
    this.listeners.set(type, bucket);
  }

  off(
    type: "sync" | "status" | "update" | "reload",
    cb: (...args: unknown[]) => void
  ): void {
    this.listeners.get(type)?.delete(cb);
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
  yjsDocMap: Map<string, Y.Doc>,
  roomProvider: RoomYjsHost
): Y.Doc {
  const rootDoc = roomProvider.getYDoc();
  const docs = rootDoc.getMap<Y.Doc>("docs");
  let doc = yjsDocMap.get(id) ?? docs.get(id);
  if (!doc) {
    doc = new Y.Doc({ guid: id });
    docs.set(id, doc);
  }
  yjsDocMap.set(id, doc);
  roomProvider.loadSubdoc(id);
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
  const doc = ensureDedicatedDoc(id, yjsDocMap, roomProvider);
  return new DocScopedProvider(roomProvider, doc, id, room);
}
