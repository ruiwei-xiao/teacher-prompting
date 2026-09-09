/**
 * Apply Workspace Assisted Authoring default onto a bot on first add.
 * Call only when a placement row is newly inserted.
 */
import { updateApp } from "@/lib/app-store/store";
import { getWorkspace } from "@/lib/workspace-store/store";

export async function applyWorkspaceAssistedAuthoringDefault(
  workspaceId: string,
  appId: string
): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  const mode = workspace?.assistedAuthoringModeDefault === true;
  await updateApp(appId, { assistedAuthoringMode: mode });
}
