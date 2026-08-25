/**
 * Chat session domain types for recorded bot conversations.
 * Physical models: chat_sessions (Postgres) / .data/chat-sessions.json (JSON fallback).
 */

export type SessionSurface = "public" | "editor-test";

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: string; // ISO timestamp (client-supplied, server-filled if absent)
  imageOmitted?: true; // set when an image attachment was stripped
};

export type ChatSessionRecord = {
  id: string; // client-generated UUID
  appId: string;
  appName: string; // snapshot at recording time
  ownerId: string; // bot owner snapshot
  participantId: string | null; // null = anonymous
  participantName: string | null; // snapshot; null = anonymous
  surface: SessionSurface;
  shared: boolean; // default true
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type SessionSummary = Omit<ChatSessionRecord, "messages"> & {
  messageCount: number;
  appExists: boolean; // resolved at read time for deleted-bot labeling
};

export type UpsertSessionTurnInput = Omit<
  ChatSessionRecord,
  "createdAt" | "updatedAt" | "shared"
> & { shared?: boolean };

export type ListPage<T> = { items: T[]; hasMore: boolean };

export type ChatSessionsFileData = {
  sessions: ChatSessionRecord[];
};
