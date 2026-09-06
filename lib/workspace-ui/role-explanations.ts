import type { WorkspaceRole } from "@/lib/workspace-store/types";

export const WORKSPACE_ROLE_EXPLANATIONS: Record<
  WorkspaceRole,
  { title: string; summary: string }
> = {
  owner: {
    title: "Owner",
    summary:
      "The Owner administers the Workspace and can delete it and transfer ownership.",
  },
  facilitator: {
    title: "Facilitator",
    summary:
      "A Facilitator can do the same day-to-day administration except delete the Workspace or change or remove the Owner.",
  },
  participant: {
    title: "Participant",
    summary:
      "A Participant uses the Workspace according to building permissions and cannot change Settings, manage members, or view Activity.",
  },
};

export const WORKSPACE_ROLE_HINT_IDS: Record<WorkspaceRole, string> = {
  owner: "workspace-role-hint-owner",
  facilitator: "workspace-role-hint-facilitator",
  participant: "workspace-role-hint-participant",
};
