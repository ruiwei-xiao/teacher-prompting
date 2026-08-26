/**
 * Pure formatters for session list and transcript presentation.
 */
import type {
  SessionSurface,
  SessionSummary,
  StoredChatMessage,
} from "@/lib/chat-session-store/types";

export type SessionNameMode = "participant" | "bot";

export type SessionListViewState = "loading" | "empty" | "items";

export const ANONYMOUS_LABEL = "Anonymous";
export const PUBLIC_CHAT_BADGE = "Public chat";
export const EDITOR_TEST_BADGE = "Editor test";
export const NOT_SHARED_LABEL = "Not shared with owner";
export const DELETED_BOT_LABEL = "Bot no longer available";
export const IMAGE_OMITTED_PLACEHOLDER = "(image attached)";

export function transcriptParticipantLabel(
  participantName: string | null | undefined
): string {
  const trimmed = participantName?.trim();
  return trimmed ? trimmed : ANONYMOUS_LABEL;
}

export function sessionDisplayName(
  session: Pick<SessionSummary, "participantName" | "appName">,
  nameMode: SessionNameMode
): string {
  if (nameMode === "bot") return session.appName;
  return transcriptParticipantLabel(session.participantName);
}

export function sessionSurfaceBadge(surface: SessionSurface): string {
  return surface === "editor-test" ? EDITOR_TEST_BADGE : PUBLIC_CHAT_BADGE;
}

export function sessionBadgeClassName(badge: string): string {
  const base =
    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";
  if (badge === EDITOR_TEST_BADGE) {
    return `${base} bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/70 dark:text-violet-200 dark:ring-violet-800`;
  }
  if (badge === PUBLIC_CHAT_BADGE) {
    return `${base} bg-white text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600`;
  }
  if (badge === NOT_SHARED_LABEL) {
    return `${base} bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-800`;
  }
  if (badge === DELETED_BOT_LABEL) {
    return `${base} bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600`;
  }
  return `${base} bg-white text-slate-700 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-600`;
}

export function sessionNotSharedBadge(
  session: Pick<SessionSummary, "shared">,
  _nameMode: SessionNameMode
): string | null {
  if (session.shared === false) {
    return NOT_SHARED_LABEL;
  }
  return null;
}

export function sessionDeletedBotBadge(
  session: Pick<SessionSummary, "appExists">
): string | null {
  return session.appExists === false ? DELETED_BOT_LABEL : null;
}

export function sessionBadges(
  session: Pick<SessionSummary, "surface" | "shared" | "appExists">,
  nameMode: SessionNameMode
): string[] {
  const badges = [sessionSurfaceBadge(session.surface)];
  const notShared = sessionNotSharedBadge(session, nameMode);
  if (notShared) badges.push(notShared);
  const deletedBot = sessionDeletedBotBadge(session);
  if (deletedBot) badges.push(deletedBot);
  return badges;
}

export function sessionListViewState(input: {
  sessionCount: number;
  loading?: boolean;
}): SessionListViewState {
  if (input.loading && input.sessionCount === 0) return "loading";
  if (input.sessionCount === 0) return "empty";
  return "items";
}

export function sessionListShowsLoadMore(input: {
  hasMore: boolean;
  sessionCount: number;
}): boolean {
  return input.hasMore && input.sessionCount > 0;
}

export function transcriptImagePlaceholder(
  message: Pick<StoredChatMessage, "imageOmitted">
): string | null {
  return message.imageOmitted ? IMAGE_OMITTED_PLACEHOLDER : null;
}

export function formatSessionStartTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
