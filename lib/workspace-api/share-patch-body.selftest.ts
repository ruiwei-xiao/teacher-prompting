/**
 * Self-test: educator share PATCH payload helper (ShareDialog / callers).
 * Run: npx tsx lib/workspace-api/share-patch-body.selftest.ts
 */
import {
  buildEducatorSharePatchBody,
  educatorSharePatchErrorMessage,
} from "./share-patch-body";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function main(): void {
  const withContext = buildEducatorSharePatchBody({
    projectShareVisibility: "public",
    shareAuthorName: true,
    communitySubject: "Math",
    communityTagsInput: "algebra, middle school",
    workspaceId: "ws_course_1",
  });

  assert(withContext.shareProject === true, "shareProject is always true");
  assert(
    withContext.workspaceId === "ws_course_1",
    "includes workspaceId so permission (c) can apply"
  );
  assert(
    withContext.projectShareVisibility === "public",
    "forwards projectShareVisibility"
  );
  assert(withContext.shareAuthorName === true, "forwards shareAuthorName");
  assert(withContext.communitySubject === "Math", "forwards communitySubject");
  assert(
    JSON.stringify(withContext.communityTags) ===
      JSON.stringify(["algebra", "middle school"]),
    "parses comma-separated community tags"
  );

  const withoutContext = buildEducatorSharePatchBody({
    projectShareVisibility: "private",
    shareAuthorName: false,
    communitySubject: "General",
    communityTagsInput: "",
  });

  assert(
    !("workspaceId" in withoutContext),
    "omits workspaceId when absent so (c) does not apply"
  );

  const blankContext = buildEducatorSharePatchBody({
    projectShareVisibility: "private",
    shareAuthorName: false,
    communitySubject: "General",
    communityTagsInput: "  ",
    workspaceId: "   ",
  });

  assert(
    !("workspaceId" in blankContext),
    "omits blank/whitespace workspaceId"
  );

  assert(
    educatorSharePatchErrorMessage(
      403,
      "Educator sharing is blocked by Workspace policy (members may not share outside)"
    ) ===
      "Educator sharing is blocked by Workspace policy (members may not share outside)",
    "403 surfaces API forbidden message"
  );

  assert(
    educatorSharePatchErrorMessage(403, "").includes("Workspace policy"),
    "403 without API body uses clear Workspace policy fallback"
  );

  assert(
    educatorSharePatchErrorMessage(500, "boom") === "boom",
    "non-403 prefers API error text"
  );

  if (failures > 0) {
    console.error(`share-patch-body.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("share-patch-body.selftest: ok");
}

main();
