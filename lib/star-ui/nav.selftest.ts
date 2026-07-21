/**
 * Self-test: Starred Library nav helpers (Tasks 3.2 / 5.2).
 * Run: npx tsx lib/star-ui/nav.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import { isStarredPath, STARRED_HREF } from "./nav";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

async function main(): Promise<void> {
  // --- Href / active path helpers ---
  assertEqual(STARRED_HREF, "/starred", "STARRED_HREF is /starred");

  assertEqual(isStarredPath("/starred"), true, "isStarredPath('/starred')");
  assertEqual(
    isStarredPath("/starred/"),
    true,
    "isStarredPath('/starred/') treats trailing slash as Starred"
  );
  assertEqual(
    isStarredPath("/starred/extra"),
    true,
    "nested under /starred is Starred"
  );

  assertEqual(isStarredPath("/"), false, "My bots root is not Starred");
  assertEqual(isStarredPath("/create"), false, "/create is not Starred");
  assertEqual(
    isStarredPath("/workspace/ws_1"),
    false,
    "workspace hub is not Starred"
  );
  assertEqual(
    isStarredPath("/starred-bots"),
    false,
    "similar prefix path is not Starred"
  );
  assertEqual(
    isStarredPath("/starredbots"),
    false,
    "concatenated lookalike path is not Starred"
  );
  assertEqual(
    isStarredPath("/api/stars"),
    false,
    "star API path is not the Starred library page"
  );
  assertEqual(
    isStarredPath("/api/stars/app_1"),
    false,
    "star API item path is not the Starred library page"
  );
  assertEqual(isStarredPath(""), false, "empty path is not Starred");

  // Starred and My bots helpers stay mutually exclusive for Library active state.
  assert(
    !(isStarredPath("/") && isStarredPath(STARRED_HREF)),
    "My bots root and Starred href are not both active paths"
  );

  // --- Sidebar wiring ---
  const sidebarPath = path.join(
    process.cwd(),
    "components/app-shell/WorkspaceSidebar.tsx"
  );
  const sidebarSource = await fs.readFile(sidebarPath, "utf8");
  assert(
    sidebarSource.includes('from "@/lib/star-ui/nav"') ||
      sidebarSource.includes("from '@/lib/star-ui/nav'"),
    "WorkspaceSidebar imports star-ui nav"
  );
  assert(
    sidebarSource.includes("STARRED_HREF"),
    "WorkspaceSidebar uses STARRED_HREF"
  );
  assert(
    sidebarSource.includes("isStarredPath"),
    "WorkspaceSidebar uses isStarredPath for active state"
  );
  assert(
    sidebarSource.includes("href={STARRED_HREF}") ||
      sidebarSource.includes("href={ STARRED_HREF }"),
    "WorkspaceSidebar Link href uses STARRED_HREF"
  );
  assert(
    sidebarSource.includes("aria-current={onStarred") ||
      sidebarSource.includes('aria-current={onStarred ? "page"'),
    "WorkspaceSidebar sets aria-current when Starred is active"
  );
  assert(
    sidebarSource.includes("Starred") && sidebarSource.includes("Link"),
    "WorkspaceSidebar still exposes a Starred Link"
  );
  assert(
    !sidebarSource.includes("Recently Used"),
    "WorkspaceSidebar has no Recently Used control"
  );
  assert(
    sidebarSource.includes("My bots"),
    "WorkspaceSidebar keeps My bots distinct"
  );
  assert(
    !sidebarSource.includes('title="Coming soon"'),
    "WorkspaceSidebar has no Coming soon placeholder for Library items"
  );

  // --- Starred page exists at the nav href ---
  const starredPagePath = path.join(process.cwd(), "app/starred/page.tsx");
  const starredPageSource = await fs.readFile(starredPagePath, "utf8");
  assert(
    starredPageSource.length > 0,
    "app/starred/page.tsx exists for STARRED_HREF"
  );

  if (failures > 0) {
    console.error(`\nnav.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("nav.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("nav.selftest crashed:", err);
  process.exit(1);
});
