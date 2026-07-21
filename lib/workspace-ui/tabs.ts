import { workspaceHubHref } from "@/lib/workspace-ui/nav";

export type WorkspaceTab =
  | "bots"
  | "settings"
  | "invites"
  | "members";

export const WORKSPACE_TABS: readonly {
  id: WorkspaceTab;
  label: string;
}[] = [
  { id: "bots", label: "Bots" },
  { id: "settings", label: "Settings" },
  { id: "invites", label: "Invites" },
  { id: "members", label: "Members" },
] as const;

const TAB_IDS = new Set<string>(WORKSPACE_TABS.map((t) => t.id));

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return TAB_IDS.has(value);
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
 */
export function resolveWorkspaceTab(
  pathname: string,
  tabParam: string,
  workspaceId: string
): WorkspaceTab {
  const tab = tabParam.replace(/^#/, "").trim().toLowerCase();
  if (isWorkspaceTab(tab)) return tab;

  // Legacy settings route without a tab → settings
  if (pathname.includes(`/workspace/${workspaceId}/settings`)) {
    return "settings";
  }

  return "bots";
}
