import { redirect } from "next/navigation";
import { resolveWorkspaceTab, workspaceTabHref } from "@/lib/workspace-ui/tabs";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/** Legacy `/settings` URLs redirect onto the unified hub `?tab=` routes. */
export default async function WorkspaceSettingsRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  // Operator mapping canonicalizes `invites` → members; the hub re-resolves with the real role.
  const tab = resolveWorkspaceTab(
    `/workspace/${workspaceId}/settings`,
    raw ?? "",
    workspaceId,
    "owner"
  );
  redirect(workspaceTabHref(workspaceId, tab));
}
