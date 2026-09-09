# Workspace Hub Improvements — E2E operator and Participant hub checklist (Task 9.2)

**Date:** 2026-09-06  
**Environment:** local repo validation (selftests + source inspection; no live signed-in hub session)  
**Aggregate status:** READY_FOR_REVIEW — critical scenarios PASS via SELFTEST/SOURCE; live signed-in UI labeled `MANUAL_VERIFY_REQUIRED` (non-blocking). `npx tsc --noEmit` and `npm run build` exit 0 after parameterizing the Postgres `ANY($1::text[])` query.

## Method legend

| Method | Meaning |
|--------|---------|
| `SELFTEST` | `npx tsx …selftest.ts` assertion(s) passed in this run |
| `SOURCE` | Code-path inspection against requirements (no live signed-in browser) |
| `SMOKE` | Unauthenticated `GET /` against a local `npm run dev` server |
| `MANUAL_VERIFY_REQUIRED` | Needs a live signed-in browser session; exact human steps provided |

---

## Critical scenarios (task 9.2)

### 1. Participant hub is Bots plus leave

| Result | **PASS** |
|--------|----------|
| Requirements | 1.1, 1.6 |
| Method | SELFTEST + SOURCE |
| Evidence | `lib/workspace-ui/tabs.selftest.ts`: `visibleWorkspaceTabs("participant")` is `["bots"]`; Settings/Members/Invites/Activity URLs resolve to Bots. `lib/workspace-ui/hub.selftest.ts`: Participant leave control shows on Bots (`shouldShowHubSelfLeave({ role: "participant", activeTab: "bots" }) === true`); Owner has no header leave; leave is not shown with Settings/Members/Activity; hub source includes `Leave Workspace` + members `DELETE`. **SOURCE** `components/workspace/WorkspaceHub.tsx`: `shouldShowHubSelfLeave` mounts `HubSelfLeaveControl` (confirm + `buildRemoveMemberBody` DELETE to `membersApiHref`); `WorkspaceNavTabs` filters with `visibleWorkspaceTabs(role)`; Participants never resolve off Bots so they do not mount Settings, Members, or Activity. `components/workspace/WorkspaceMemberList.tsx` returns `null` when `!shouldLoadMembersRoster(role)` (Participants). |

### 2. Operator Members copy of the shown share link works

| Result | **PASS** |
|--------|----------|
| Requirements | 2.5 |
| Method | SELFTEST + SOURCE |
| Evidence | `lib/workspace-ui/share-link.selftest.ts`: `toShareLinkClipboardText(shareLinkUrlForRole(links, "participant"))` copies the shown path; with origin, copy is the absolute shown URL; already-absolute URLs are unchanged; control source includes Copy + `navigator.clipboard` / `toShareLinkClipboardText`. `lib/workspace-ui/members.selftest.ts`: Members hosts `WorkspaceShareLinkControl`. **SOURCE** `components/workspace/WorkspaceShareLinkControl.tsx`: `shownUrl` is `shareLinkUrlForRole(linkByRole, role, origin)`; `copyShownUrl` writes `toShareLinkClipboardText(shownUrl, origin)` via `navigator.clipboard.writeText`. `components/workspace/WorkspaceMemberList.tsx` renders `<WorkspaceShareLinkControl workspaceId={workspaceId} />` on the operator Members section. |

### 3. Create dialog is not clipped by the sidebar

| Result | **PASS** |
|--------|----------|
| Requirements | 5.1 |
| Method | SELFTEST + SOURCE |
| Evidence | `lib/workspace-ui/nav.selftest.ts`: `CreateWorkspaceDialog` includes `createPortal` and `document.body` so the overlay is not clipped by sidebar overflow; `max-w-(xl\|2xl\|3xl\|4xl)` is large enough for four permission toggles. **SOURCE** `components/workspace/CreateWorkspaceDialog.tsx` returns `createPortal(overlay, document.body)` with `fixed inset-0 z-50` and `max-w-2xl`. `components/app-shell/WorkspaceSidebar.tsx` still *composes* the dialog as a child, but `components/app-shell/AppShell.tsx` wraps sidebar content in `overflow-y-auto`; the portal target is `document.body`, so the overlay is not a descendant of that overflow clip. |

### 4. Activity lists shared sessions across two placed bots

| Result | **PASS** |
|--------|----------|
| Requirements | 3.1 |
| Method | SELFTEST + SOURCE |
| Evidence | `lib/chat-session-store/store.selftest.ts`: `listSharedSessionsForAppIds([botA, botB])` returns a combined recency page across both bots (not per-bot pages); sessions for `botC` are excluded. `lib/workspace-api/workspaces-sessions.selftest.ts`: Owner list for a Workspace with two current placements (`bot_owned`, `bot_others`) is `sess-owned-newest`, `sess-others-middle`, `sess-owned-older` and matches `listSharedSessionsForAppIds` of those placement ids; includes a bot the operator does not own. `lib/workspace-ui/activity.selftest.ts`: hub Activity mounts `WorkspaceActivityView`; list fetch is `GET /api/workspaces/:id/sessions`. **SOURCE** `lib/workspace-api/workspaces-sessions.ts` `listWorkspaceSessions` lists current placements then `listSharedSessionsForAppIds`. `components/workspace/WorkspaceActivityView.tsx` loads via `fetchWorkspaceSessions` / `fetchWorkspaceTranscript` (`components/sessions/session-client.ts` → `/api/workspaces/${workspaceId}/sessions` and `/sessions/:sessionId`, not personal `/api/sessions/:id`). File-store path: `listSharedSessionsForAppIdsInFile` filters `session.shared && allowed.has(session.appId)`. Postgres SQL uses `sql.query` with `WHERE shared = TRUE AND app_id = ANY($1::text[])` and bound `[ids, limit+1, offset]` (file-store path unchanged). |

### 5. A session with sharing off is hidden

| Result | **PASS** |
|--------|----------|
| Requirements | 3.4 |
| Method | SELFTEST + SOURCE |
| Evidence | `lib/chat-session-store/store.selftest.ts`: `sess-a-unshared` (`shared: false`) is not in `listSharedSessionsForAppIds([botA, botB])`; every returned item has `shared === true`. `lib/workspace-api/workspaces-sessions.selftest.ts`: `sess-owned-unshared` is absent from the operator list; operator transcript of that id is 403; listed rows all have `shared === true`. **SOURCE** file filter `session.shared`; Postgres `WHERE shared = TRUE`; transcript `getWorkspaceSessionTranscript` returns 403 when `session.shared !== true`. Hub UI never lists unshared rows because it only renders the workspace list API payload. |

### 6. Those flows behave as specified when exercised in the app

| Result | **PASS (wired; live hub not run)** |
|--------|-------------------------------------|
| Requirements | 1.1, 1.6, 2.5, 3.1, 3.4, 5.1 |
| Method | SELFTEST + SOURCE + SMOKE |
| Evidence | Hub, Members, create-dialog, and Activity UI are composed on the production components above; selftests assert both helper behavior and source wiring. **SMOKE** `npm run dev` + unauthenticated `GET http://localhost:3000/` → HTTP 200 Sign-in (Google/Microsoft). No Workspace hub chrome without auth — expected. Signed-in operator/Participant hub was **not** exercised in a browser (no credentials). Do not treat this row as a live multi-role UI pass. |

---

## Supporting matrix (design Testing Strategy — E2E / UI)

| # | Scenario | Result | Method | Evidence |
|---|----------|--------|--------|----------|
| S1 | Participant tabs = Bots only | PASS | SELFTEST | `tabs.selftest`, `hub.selftest`, `WorkspaceNavTabs` filters `visibleWorkspaceTabs` |
| S2 | Participant leave on Bots without admin sections | PASS | SELFTEST + SOURCE | `hub.selftest` `shouldShowHubSelfLeave`; `WorkspaceHub` leave + tab-gated Settings/Members/Activity |
| S3 | Operator copy uses currently shown role URL | PASS | SELFTEST + SOURCE | `share-link.selftest`; `WorkspaceShareLinkControl.copyShownUrl` |
| S4 | Share-link control lives on Members | PASS | SELFTEST + SOURCE | `members.selftest`; `WorkspaceMemberList` mounts control |
| S5 | Create overlay portaled to `document.body` | PASS | SELFTEST + SOURCE | `nav.selftest`; `createPortal(overlay, document.body)` |
| S6 | Activity list is workspace session routes | PASS | SELFTEST + SOURCE | `activity.selftest` (`fetchWorkspaceSessions`, no `/api/sessions/:id`, not event feed) |
| S7 | Two placed bots, combined shared list | PASS | SELFTEST | `store.selftest`, `workspaces-sessions.selftest` |
| S8 | Sharing-off excluded from list and transcript | PASS | SELFTEST + SOURCE | `store.selftest`, `workspaces-sessions.selftest`, `shared !== true` → 403 |
| S9 | Participant denied Workspace sessions API | PASS | SELFTEST | `workspaces-sessions.selftest` Participant list/transcript 403 |
| S10 | Participant roster GET forbidden | PASS | SELFTEST | `workspaces-members.selftest` Participant list → 403; self-leave still 200 |

---

## Optional live UI smoke (not blocking)

These paths are covered by API/UI helper selftests above. Marked for a human only if a signed-in two-role confirmation is desired before release.

### M1. Participant hub Bots + leave (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Needs a signed-in Participant membership |
| Steps | 1. Sign in as a Participant of a Workspace. 2. Open that Workspace hub. 3. Confirm only the Bots tab is shown (no Settings, Members, Invites, or Activity). 4. Confirm Leave Workspace on Bots; confirm leave; land on My bots. 5. Open `?tab=settings`, `?tab=members`, `?tab=activity` — still Bots, no roster/invite/Activity content. |

### M2. Operator Members share-link copy (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Clipboard write needs a browser + operator session |
| Steps | 1. Sign in as Owner or Facilitator. 2. Open Members. 3. Select Facilitator, confirm the shown URL, Copy, paste matches that URL. 4. Select Participant, Copy, paste matches the Participant URL (not the Facilitator one). |

### M3. Create dialog not clipped by sidebar (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Visual clipping vs sidebar overflow needs a viewport |
| Steps | 1. Sign in. 2. From the sidebar, open + New workspace. 3. Confirm the dialog is a viewport overlay (not cropped inside the sidebar scroller); name + four permission toggles are fully readable. 4. Repeat at a short viewport height and with the mobile drawer open. |

### M4. Activity across two placed bots; sharing-off hidden (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Needs two placed bots and at least one unshared session |
| Steps | 1. As operator, place two bots in the Workspace. 2. Create a shared session on each. 3. Open Activity — both appear, newest first. 4. Turn sharing off on one session. 5. Refresh Activity — that session is gone; opening its id on the workspace transcript route is denied. |

---

## Commands run (2026-09-06)

All of the following selftests exited 0 (`all assertions passed` / `OK:`):

```text
npx tsx lib/workspace-ui/tabs.selftest.ts
npx tsx lib/workspace-ui/hub.selftest.ts
npx tsx lib/workspace-ui/share-link.selftest.ts
npx tsx lib/workspace-ui/nav.selftest.ts
npx tsx lib/workspace-ui/activity.selftest.ts
npx tsx lib/workspace-ui/members.selftest.ts
npx tsx lib/workspace-api/workspaces-sessions.selftest.ts
npx tsx lib/workspace-api/workspaces-members.selftest.ts
npx tsx lib/chat-session-store/store.selftest.ts
```

Typecheck / production build (**passed** after parameterizing `listSharedSessionsForAppIdsInPostgres` with `sql.query` / `$1::text[]`):

```text
npx tsc --noEmit
# exit 0

npm run build
# Next.js 16.1.6 (Turbopack): compiled, TypeScript, and static generation succeeded
```

Smoke (unauthenticated only):

```text
npm run dev
curl http://localhost:3000/   # HTTP 200, Sign in (Google / Microsoft)
```

Dev server was stopped after the smoke GET. Signed-in Workspace hub, Members copy, create-dialog clipping, and Activity browse were **not** run in a browser.

## Counts

| Result | Critical (6) | Supporting | Optional live |
|--------|--------------|------------|---------------|
| PASS | 6 | 10 | 0 |
| FAIL | 0 | 0 | 0 |
| MANUAL_VERIFY_REQUIRED | 0 | 0 | 4 |

**Unresolved blockers:** none. `npx tsc --noEmit` and `npm run build` exit 0. File-store Activity list selftests still pass. Postgres list uses parameterized `ANY($1::text[])` (not a tagged-template interpolant).

**Live browser:** not run (no signed-in session).
