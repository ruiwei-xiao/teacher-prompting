"use client";

import WorkspaceRoleHint from "./WorkspaceRoleHint";

/** One hover/? row for Owner / Facilitator / Participant (Req 6.1). */
export default function WorkspaceRoleHintGroup() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WorkspaceRoleHint role="owner" />
      <WorkspaceRoleHint role="facilitator" />
      <WorkspaceRoleHint role="participant" />
    </div>
  );
}
