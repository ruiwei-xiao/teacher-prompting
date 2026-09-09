import type { WorkspaceRole } from "@/lib/workspace-store/types";
import { workspaceHubHref } from "@/lib/workspace-ui/nav";

export type WorkspaceTab = "bots" | "settings" | "members" | "activity";

export const WORKSPACE_TABS: readonly {
  id: WorkspaceTab;
  label: string;
}[] = [
  { id: "bots", label: "Bots" },
  { id: "settings", label: "Settings" },
  { id: "members", label: "Members" },
  { id: "activity", label: "Activity" },
] as const;

const TAB_IDS = new Set<string>(WORKSPACE_TABS.map((t) => t.id));

const PARTICIPANT_TABS: readonly WorkspaceTab[] = ["bots"];
const OPERATOR_TABS: readonly WorkspaceTab[] = [
  "bots",
  "settings",
  "members",
  "activity",
];

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return TAB_IDS.has(value);
}

export function visibleWorkspaceTabs(
  role: WorkspaceRole
): readonly WorkspaceTab[] {
  return role === "participant" ? PARTICIPANT_TABS : OPERATOR_TABS;
}

/**
 * Sidebar / hub section order: course work first, administration after.
 * Distinct from WORKSPACE_TABS source order.
 */
export const WORKSPACE_SECTION_NAV_ORDER: readonly WorkspaceTab[] = [
  "bots",
  "activity",
  "members",
  "settings",
];

/** Role-visible sections in sidebar order. */
export function workspaceSectionNav(
  role: WorkspaceRole
): readonly WorkspaceTab[] {
  const visible = new Set(visibleWorkspaceTabs(role));
  return WORKSPACE_SECTION_NAV_ORDER.filter((tab) => visible.has(tab));
}

/** Hide extra section links when only Bots is available (Participant). */
export function shouldShowWorkspaceNavTabs(role: WorkspaceRole): boolean {
  return workspaceSectionNav(role).length > 1;
}

/** All tabs share one hub URL; only the `tab` query changes. */
export function workspaceTabHref(
  workspaceId: string,
  tab: WorkspaceTab
): string {
  const base = workspaceHubHref(workspaceId);
  if (tab === "bots") return base;
  return `${base}?tab=${tab}`;
}

/**
 * Resolve active tab from `tab` query on the workspace hub.
 * Pathname is accepted for legacy `/settings` redirects but is not required
 * when everything lives on the hub.
 *
 * Participants never resolve to settings, members, or activity.
 * Operators map former `invites` URLs to members.
 */
export function resolveWorkspaceTab(
  pathname: string,
  tabParam: string,
  workspaceId: string,
  role: WorkspaceRole
): WorkspaceTab {
  const tab = tabParam.replace(/^#/, "").trim().toLowerCase();
  const participant = role === "participant";

  let resolved: WorkspaceTab;
  if (tab === "invites") {
    resolved = "members";
  } else if (isWorkspaceTab(tab)) {
    resolved = tab;
  } else if (pathname.includes(`/workspace/${workspaceId}/settings`)) {
    resolved = "settings";
  } else {
    resolved = "bots";
  }

  if (participant && resolved !== "bots") {
    return "bots";
  }
  return resolved;
}
