# Educator Workspaces — E2E authz & coexistence checklist (Task 7.2)

**Date:** 2026-07-20  
**Environment:** local repo validation (selftests + code-path inspection; no live multi-user browser session)  
**Aggregate status:** READY_FOR_REVIEW — critical scenarios PASS; optional live UI smoke labeled `MANUAL_VERIFY_REQUIRED` (non-blocking)

## Method legend

| Method | Meaning |
|--------|---------|
| `SELFTEST` | `npx tsx …selftest.ts` assertion(s) passed |
| `CODE` | Code-path inspection against requirements |
| `PROBE` | One-off runtime probe (not committed) |
| `MANUAL_VERIFY_REQUIRED` | Needs a live signed-in browser session; exact human steps provided |

---

## Critical scenarios (task 7.2)

### 1. Roles — Owner / Facilitator / Participant

| Result | **PASS** |
|--------|----------|
| Requirements | 3.2, 3.3, 3.4 |
| Method | SELFTEST |
| Evidence | `lib/workspace-store/permissions.selftest.ts`: Owner may `workspace.delete` / `members.manage` / `workspace.updatePermissions`; Facilitator may manage members & permissions but not delete; Participant denied settings/members/delete. `lib/workspace-api/workspaces-crud.selftest.ts`: Owner delete succeeds; Participant forbidden on settings/delete mutations. `lib/workspace-ui/settings.selftest.ts`: Facilitator can save permissions; Participant cannot open Owner-only delete. |

### 2. Building permissions (a)–(d)

| Result | **PASS** |
|--------|----------|
| Requirements | 5.2–5.9 |
| Method | SELFTEST |
| Evidence | **(a)** `permissions.selftest` + `apps-gates.selftest` + `create.selftest`: Participant create/place denied when `canCreateBots` off; allowed when on; Owner/Facilitator bypass. **(b)** `permissions.selftest` + `hub.selftest` + `workspaces-bots.selftest`: Participant with `canSeeOthersBots` off cannot view/inspect others; Facilitator sees all. **(c)** `permissions.selftest` + `apps-gates.selftest` + `share-patch-body.selftest`: with `workspaceId`, Participant `shareProject`/Community fields blocked when `canShareOutside` off; without Workspace context (c) does not apply; Owner/Facilitator bypass. **(d)** `permissions.selftest` + `apps-gates.selftest` + `workspaces-placements.selftest`: Participant delete/unplace own blocked when `canManageOwnBots` off; Facilitator may unplace others without deleting bots. |

### 3. Publish ungated by permission (c)

| Result | **PASS** |
|--------|----------|
| Requirements | 5.7, 7.2 |
| Method | SELFTEST + CODE |
| Evidence | `permissions.selftest`: `bots.publish` ok for Participant with (c) off (and even null membership). `apps-gates.selftest`: `patchTouchesEducatorOutwardFields({ publish: true }) === false`; `assertEducatorOutwardShareGate` with `{ publish: true }` + workspaceId + (c) off → ok. `lib/workspace-api/apps-gates.ts`: Publish-only bodies never enter the (c) gate. Wired in `app/api/apps/[appId]/route.ts` via `assertEducatorOutwardShareGate`. |

### 4. Placement does not Community-publish

| Result | **PASS** |
|--------|----------|
| Requirements | 7.3, 8.2 |
| Method | SELFTEST + CODE + PROBE |
| Evidence | `placeApp` / `placeAppInFile` only appends a placement row (`workspaceId`, `appId`, `placedByUserId`, `placedAt`) — never calls app-store update (`lib/workspace-store/store.ts`). `workspaces-placements.selftest`: place keeps personal `ownerId`; multi-Workspace place unchanged ownership. Runtime probe 2026-07-20: after `placeApp`, `publishedAt`/`communitySubject`/`communityTags` remain null; `projectShareVisibility` not public. `CommunityGrid` lists apps with `publishedAt` only (`components/dashboard/CommunityGrid.tsx`) and does not consult placements. |

### 5. Invite sign-in (email accept + signed-out join return)

| Result | **PASS** |
|--------|----------|
| Requirements | 2.1, 2.3, 8.3, 8.4, 9.2 |
| Method | SELFTEST + CODE |
| Evidence | `lib/auth/accept-pending-email-invites.selftest.ts` + store accept path: matching email becomes membership on sign-in; consumed invites do not re-add after leave. `auth.ts` JWT callback calls `acceptPendingEmailInvitesOnSignIn` when `user` + `token.userId` + `token.email` present. `join.selftest` + `proxy.ts`: `/workspace/:path*` requires auth; signed-out redirect uses `/?callbackUrl=…` back to invite landing; landing POSTs join and routes to hub; invalid invite shows “no longer valid”. `workspaces-invites.selftest`: valid link join; revoked/expired rejected. |

### 6. 100+ member search

| Result | **PASS** |
|--------|----------|
| Requirements | 9.1, 9.3 |
| Method | SELFTEST |
| Evidence | `store.selftest`: Workspace supports ≥100 members. `workspaces-members.selftest`: lists 100 members; `q=member_01` filters. `members.selftest`: roster ≥100; UI builds `/api/workspaces/.../members?q=` search. |

### 7. My bots / Community regression (coexistence)

| Result | **PASS** |
|--------|----------|
| Requirements | 1.5, 7.1, 7.3, 7.5 |
| Method | SELFTEST + CODE |
| Evidence | `nav.selftest`: `MY_BOTS_HREF === "/"`; empty membership list still ok; sidebar has no placeholder Example Institute names. `create.selftest`: personal create omits `workspaceId`; create does not require a Workspace. `app/page.tsx`: signed-in dashboard still renders My bots (`AppGrid`) and Community (`CommunityGrid`) tabs independently of Workspace membership. Community discovery still filters on `publishedAt` only — no Workspace membership gate. Students are not modeled as Workspace members (Workspace APIs/pages under educator auth proxy). |

---

## Supporting matrix (design integration / E2E paths)

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| S1 | Owner delete vs Facilitator cannot | PASS | `permissions.selftest`, `workspaces-crud.selftest` |
| S2 | (b) off hides others from Participant; Facilitator sees all | PASS | `hub.selftest`, `workspaces-bots.selftest` |
| S3 | (c) blocks shareProject, never publish | PASS | `apps-gates.selftest` |
| S4 | (d) off blocks Participant DELETE; Facilitator unplace | PASS | `apps-gates.selftest`, `workspaces-placements.selftest` |
| S5 | Invite accept idempotent; revoked rejected | PASS | `store.selftest`, `workspaces-invites.selftest` |
| S6 | Create Workspace → creator Owner | PASS | `store.selftest`, `workspaces-crud.selftest` |
| S7 | Same bot in two Workspaces; ownerId unchanged | PASS | `store.selftest`, `workspaces-placements.selftest` |
| S8 | Non-member hub/API → 403 | PASS | `workspaces-crud` / placements / members selftests |
| S9 | Peer duplicate strips secrets / caller owns fork | PASS | `workspaces-bots.selftest`, `fork.selftest`, `peer-preview.selftest` |
| S10 | Create-into-Workspace when (a) allows | PASS | `apps-gates.selftest`, `create.selftest` |

---

## Optional live UI smoke (not blocking)

These paths are covered by API/UI helper selftests above. Marked for a human only if a signed-in two-browser confirmation is desired before release.

### M1. Two-user invite-link join (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Needs two real educator sessions in a browser |
| Steps | 1. Sign in as User A; create Workspace; open Invites; create Participant link; copy URL. 2. Sign out / second browser as User B; open link while signed out → confirm redirect to sign-in with `callbackUrl` back to invite. 3. Sign in as B → join succeeds → Workspace hub. 4. Revoke link as A; open as User C → “no longer valid”. |

### M2. Facilitator toggles (b)/(c)/(d) in Settings UI (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Visual confirmation of Settings form + subsequent hub/share UX |
| Steps | 1. As Facilitator, open Workspace Settings; toggle (b)/(c)/(d); save. 2. As Participant, confirm hub grid respects (b); share from hub with (c) off shows forbidden; Publish from editor still works; delete own bot blocked when (d) off. 3. As Facilitator, confirm activity shows permissions.updated. |

### M3. Dashboard My bots + Community visual smoke (live)

| Result | **MANUAL_VERIFY_REQUIRED** |
|--------|----------------------------|
| Why | Visual regression only; code path already PASS |
| Steps | 1. Sign in with zero Workspace memberships → My bots tab lists personal apps; Community tab still browseable. 2. Place an unpublished bot into a Workspace → confirm it does **not** appear in Community until Publish. |

---

## Commands run (2026-07-20)

All of the following exited 0 (`all assertions passed` / `ok` / `tsc_exit=0`):

```text
npx tsx lib/workspace-store/permissions.selftest.ts
npx tsx lib/workspace-store/store.selftest.ts
npx tsx lib/workspace-api/apps-gates.selftest.ts
npx tsx lib/workspace-api/share-patch-body.selftest.ts
npx tsx lib/workspace-api/workspaces-bots.selftest.ts
npx tsx lib/workspace-api/workspaces-placements.selftest.ts
npx tsx lib/workspace-api/workspaces-activity.selftest.ts
npx tsx lib/workspace-api/workspaces-invites.selftest.ts
npx tsx lib/workspace-api/workspaces-members.selftest.ts
npx tsx lib/workspace-api/workspaces-crud.selftest.ts
npx tsx lib/auth/accept-pending-email-invites.selftest.ts
npx tsx lib/workspace-ui/create.selftest.ts
npx tsx lib/workspace-ui/join.selftest.ts
npx tsx lib/workspace-ui/peer-preview.selftest.ts
npx tsx lib/workspace-ui/activity.selftest.ts
npx tsx lib/workspace-ui/invites.selftest.ts
npx tsx lib/workspace-ui/members.selftest.ts
npx tsx lib/workspace-ui/settings.selftest.ts
npx tsx lib/workspace-ui/nav.selftest.ts
npx tsx lib/workspace-ui/hub.selftest.ts
npx tsx lib/app-store/fork.selftest.ts
npx tsc --noEmit
```

Plus one-off place→non-publish probe (ok:true; not committed).

## Counts

| Result | Critical (7) | Supporting | Optional live |
|--------|--------------|------------|---------------|
| PASS | 7 | 10 | 0 |
| FAIL | 0 | 0 | 0 |
| MANUAL_VERIFY_REQUIRED | 0 | 0 | 3 |

**Unresolved blockers:** none
