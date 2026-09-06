# Gap Analysis: workspace-hub-improvements

**Date**: 2026-09-06  
**Context**: `$kiro-validate-gap workspace-hub-improvements`  
**Requirements status**: generated, **not approved** (`spec.json.approvals.requirements.approved: false`). Analysis can still inform design or requirement revisions.

---

## Summary

- **Scope**: Brownfield hub UX on top of `educator-workspaces`, `bot-activity-sessions`, and `assisted-authoring-mode`. Most tabs, invites, settings, and session UI already exist; the gaps are role-filtered navigation, reusable share-link UX, Workspace-wide shared transcripts, a Workspace Assisted Authoring default, and a larger create dialog.
- **Largest gap**: Workspace Activity. Chat sessions can be listed per bot (shared-only) or per participant. There is no query by `workspaceId` / multiple `appId`s. Transcript read is **bot owner or session participant only**, so Owners/Facilitators cannot legally open peers’ placed-bot logs today. Extending that gate is the privacy-critical change.
- **Invites**: Link tokens are already reusable (many joiners, not consumed on accept). The product gap is UX and cardinality: `createInvite` always inserts a new row, with **no one-active-link-per-role** rule, and the UI lists every active invite. Email pending invites are not roster rows.
- **Create dialog**: Name-only POST `{ name }`, rendered inside `WorkspaceSidebar` (`overflow-y-auto`, no portal) — matches the “clipped to sidebar” complaint. Building permissions cannot be set at create time.
- **Assisted Authoring default**: Per-bot field and Settings toggle exist. Workspace has no default field. `placeApp` does not mutate the bot; create-into-Workspace always uses `assistedAuthoringMode: false`.
- **Preferred direction for design (not a decision)**: Hybrid — extend store/API/authz and tab helpers; add focused UI for share-link, Activity, role hints, and a viewport-level create dialog; do not reuse the membership/placement activity feed as the new Activity tab.

---

## Current State Investigation

### Domain layout

| Area | Location | Pattern |
|------|----------|---------|
| Hub UI | `components/workspace/*`, `app/workspace/[workspaceId]/page.tsx` | Client hub + `?tab=` |
| Tab helpers | `lib/workspace-ui/tabs.ts` | Shared href/resolve; self-tests |
| Permissions | `lib/workspace-store/permissions.ts` | Role × building-permission matrix |
| Store façade | `lib/workspace-store/store.ts` | Postgres or JSON file |
| Invites API | `lib/workspace-api/workspaces-invites.ts` | `members.manage` for list/create/revoke |
| Sessions | `lib/chat-session-store`, `lib/chat-session-api`, `components/sessions/*` | Per-app owner list; per-user My sessions; shared transcript gate |
| Assisted authoring | `lib/assisted-authoring/*`, `lib/app-store` | Per-bot boolean; new bots default OFF |
| Tests | `*.selftest.ts` next to modules | `npx tsx …`; no repo test runner (`tech.md`) |

Conventions: App Router routes delegate to `lib/*`; UI parsers live in `lib/workspace-ui`; Owner-scoped app reads via `getAppById(id, userId)` except explicit public/share paths.

### What already works (reuse)

- Roles Owner / Facilitator / Participant; Facilitator has `members.manage`, `workspace.updatePermissions`, `activity.viewFacilitation`; Owner-only delete.
- Building permissions (a)–(d); **new Workspace default all off**, including (b) `canSeeOthersBots`.
- Hub tabs: Bots, Settings, Invites, Members — **shown to every member**. Participants see read-only Settings/Invites copy, not hidden tabs.
- Invite **link join is already many-to-one** (`acceptInviteByToken` does not revoke the link; burst-join self-tests).
- Email invite: pending until matching sign-in; then `revokedAt` (one-shot).
- `canSelfLeave`: Participant and Facilitator can leave from **Members**; Owner cannot.
- Per-bot Activity: `SessionList` / `SessionTranscript` / `SessionBrowseLayout`; `listSessionsForApp` is shared-only with limit/offset; `SessionSummary` already has `appName`.
- Lightweight Workspace activity API (`member.joined`, `bot.placed`, …) exists; **hub does not render it** (`activity.selftest.ts`). Must not be the new Activity tab (Req 3.8).
- Settings form: rename + (a)–(d); Facilitator can save; Owner can delete.

### Constraints from architecture

- Dual persistence (Postgres + JSON) — any new Workspace field or invite uniqueness rule must land in both paths + self-tests.
- `getSessionTranscript` (`lib/chat-session-api/transcript.ts`) encodes privacy: participant always; owner only if `shared === true`.
- `placeWorkspaceBot` allows **only the bot owner** to place; applying a Workspace Assisted Authoring default on place therefore updates a bot the actor already owns.
- Create dialog lives under `AppShell` sidebar `overflow-y-auto` (`components/app-shell/AppShell.tsx` ~line 252). `fixed inset-0` without a portal is clipped by that ancestor.
- `tabs.selftest.ts` currently asserts `?tab=activity` **falls back to bots** and `?tab=invites` stays `invites` — both must change with Req 1.

---

## Requirement-to-Asset Map

Tags: **Reuse** / **Extend** / **Missing** / **Unknown** / **Constraint**

### Requirement 1 — Role-based hub tabs

| Need | Assets | Gap |
|------|--------|-----|
| Tab set Bots / Settings / Members / Activity; no Invites tab | `tabs.ts`, `WorkspaceNavTabs`, `WorkspaceHub` | **Extend**: add `activity`; drop `invites` from `WORKSPACE_TABS`; filter by role |
| Participant sees only Bots | Nav has no `role` prop | **Missing** visibility helper; pass `role` into tabs |
| Disallowed tab URL → Bots | `resolveWorkspaceTab` | **Extend**: invite → members for operators; activity/settings/members → bots for Participants |
| Legacy `?tab=invites` → Members | `resolveWorkspaceTab`, settings redirect page | **Extend** |
| Participant leave without Members | `WorkspaceMemberList` `handleSelfLeave`, `canSelfLeave` | **Missing** leave control on Bots (or chrome) |
| Participant must not see roster | Members API allows any member `workspace.view` | **Constraint**: hide UI and do not fetch roster on Participant hub; API may still list members if called — design should deny or ignore for Participants if Req 1.7 is interpreted strictly |

### Requirement 2 — Invites on Members

| Need | Assets | Gap |
|------|--------|-----|
| Invite from Members | `WorkspaceInvitePanel`, Members tab | **Extend**: compose panel into Members; remove Invites tab |
| Reusable link, many joiners | Store accept path | **Reuse** (already true) |
| One current URL per role; show + copy without creating | `createInvite` always INSERT | **Missing** ensure/get-or-create current link per `(workspaceId, role, kind=link)` |
| No Active invites link list | `WorkspaceInvitePanel` lists `filterActiveInvites` | **Extend** UI: remove list; Google Docs–style role → URL → copy |
| Reset link invalidates old token | `revokeInvite` + new `createInvite` | **Extend**: reset = revoke current + create replacement; reject old token (already 410) |
| Pending email on Members as not-yet-joined | `listInvites`; members list is memberships only | **Missing** pending-email rows (or equivalent) on Members |
| Existing workspaces with many link rows per role | No uniqueness | **Unknown** migration: pick latest active per role and revoke extras vs lazy collapse on first Members load |

### Requirement 3 — Workspace Activity

| Need | Assets | Gap |
|------|--------|-----|
| List shared sessions for all placed bots | `listSessionsForApp(appId)`, `listPlacements` | **Missing** workspace-scoped list (multi-app merge + paging) |
| Show bot name, participant, start, surface | `SessionSummary.appName`, badges | **Reuse** list UI with `nameMode` showing both bot and participant (**Unknown** if current `SessionList` can show both without a small extension) |
| Open read-only transcript | `SessionTranscript`, `GET /api/sessions/[id]` | **Extend** authz: Workspace Owner/Facilitator + bot currently placed + `shared` |
| Hide unshared | Store lists already shared-only per app | **Reuse** for list; **Constraint** transcript must re-check `shared` and placement |
| Empty state | SessionList `emptyMessage` | **Reuse** |
| Unplaced bot disappears from list | No workspace index | **Extend** filter by current placements only |
| Deny Participant / non-member | `activity.viewFacilitation` already owner\|facilitator | **Reuse** permission action; **Missing** hub tab + API wiring |
| Not membership event feed | `GET /api/workspaces/:id/activity` | **Constraint**: do not reuse that route for chat sessions |
| No edit/delete | Existing session UI is read-only | **Reuse** |

### Requirement 4 — Workspace Assisted Authoring default

| Need | Assets | Gap |
|------|--------|-----|
| Settings ON/OFF default | `WorkspacePermissionsForm`, PATCH workspace | **Missing** field on `Workspace`; PATCH parser only knows `name` + `buildingPermissions` |
| New Workspace default OFF | `createWorkspace({ name, ownerUserId })` | **Extend** create + persist default OFF |
| Apply on create-into-Workspace | `createDefaultBotFields()` always `false`; `placeAppIntoWorkspaceAfterCreate` | **Extend** create path to set mode from Workspace default (ON would differ from global new-bot OFF) |
| Apply on place | `placeApp` placement row only | **Extend** `placeWorkspaceBot` / after-create to `updateApp` mode |
| Later default change does not rewrite existing bots | No default field yet | **Reuse** if apply only on create/place events |
| Per-bot Settings override | Existing PATCH apps | **Reuse** |
| Participant cannot change default | `canEditWorkspaceSettings` | **Reuse** |

### Requirement 5 — Workspace creation

| Need | Assets | Gap |
|------|--------|-----|
| Larger dialog not clipped | `CreateWorkspaceDialog` in sidebar | **Extend** or **Missing** portal to `document.body`; widen layout |
| Name + four permission toggles | `BUILDING_PERMISSION_FIELDS`; create API ignores permissions | **Extend** POST body + `createWorkspace` |
| Start all-off, editable | `DEFAULT_BUILDING_PERMISSIONS` | **Reuse** defaults; **Extend** UI |
| Optional invite with same share-link pattern | Invite APIs need `workspaceId` | **Constraint**: invite after create succeeds (two-step in one dialog) — **Unknown** exact flow (create first then unlock invite vs wizard) |
| Apply permissions + honors invites | Create then PATCH/invite | **Extend** |
| No AA default in create dialog | — | **Reuse** (omit control) |

### Requirement 6 — Role explanations

| Need | Assets | Gap |
|------|--------|-----|
| Short hover / “?” copy | Role labels only | **Missing** copy helper + tooltip control on invite role picker and Members role names |
| Keep names Owner / Facilitator / Participant | UI already | **Reuse** |

### Requirement 7 — Unchanged visibility default

| Need | Assets | Gap |
|------|--------|-----|
| (b) off unless creator turns on | Defaults + Settings | **Reuse**; create dialog must not default (b) on |
| Participant vs facilitation listing | `listWorkspacePlacements`, hub `visiblePlacements` | **Reuse** |

---

## Implementation Approach Options

### Option A — Extend existing components

Extend `tabs.ts`, `WorkspaceHub`, `WorkspaceNavTabs`, `WorkspaceInvitePanel`, `WorkspaceMemberList`, `CreateWorkspaceDialog`, `WorkspacePermissionsForm`, `workspaces-crud`, `workspaces-invites`, `workspace-store`, `transcript.ts`, `placeWorkspaceBot`, apps create gate.

- **Rationale**: Same hub, same invite join tokens, same session components.
- **Trade-offs**: Fast, matches current files; `WorkspaceHub` / invite panel / `store.ts` grow further; easy to mix chat Activity with the unused event-feed helpers.
- ✅ Minimal new files  
- ❌ Bloat and easy privacy mistakes in transcript.ts

### Option B — New components only

New hub shell, new invite service, new session store dimension, new create modal app.

- **Rationale**: Clean share-link and Activity bounded contexts.
- **Trade-offs**: Duplicates join/accept and session list; fights dual-store and self-test layout.
- ✅ Isolation  
- ❌ Too much rewrite for a hub improvement spec

### Option C — Hybrid (extend domain, new UI slices)

**Extend**: Workspace type + store (AA default; ensure/reset link per role); PATCH/POST workspace; invite API get-or-create + reset; `place` / create-into-workspace apply AA; new workspace session list and transcript API; tab resolve/visibility; settings form field.

**New**: Viewport-portaled create dialog (or portal wrapper); Members-composed invite share control + pending email rows; `WorkspaceActivityView` wrapping existing `SessionList`/`SessionTranscript`; role hint helper; Participant leave on Bots.

**Phasing (informational)**: (1) tabs + leave + role hints, (2) share-link + Members compose + create dialog, (3) AA default, (4) Activity list + transcript authz.

- ✅ Aligns with `lib/workspace-*` + `lib/chat-session-*` façades  
- ✅ Reuses session chrome  
- ❌ Needs a coordinated authz design so Facilitators cannot read unshared or unplaced bots  

---

## Effort and Risk

| | Rating | Justification |
|--|--------|----------------|
| **Effort** | **L** (about 1–2 weeks) | Many UI surfaces plus store/API in two persistence modes, invite cardinality migration, and a new session aggregation path. Not XL: no new product domain or student-chat rewrite. |
| **Risk** | **Medium** (privacy High if Activity authz is sloppy) | Transcript expansion is the failure mode (Facilitator reads unshared or non-placed bots). Invite reset and dual-store uniqueness are well-understood. Create-dialog portal is low risk. |

Complexity mix: UI workflow + authz rules + light aggregation. No new external services (email still in-app pending).

---

## Research Needed (carry into design)

1. **Workspace session query**: Merge N× `listSessionsForApp` vs new store method `listSharedSessionsForAppIds` / `workspaceId` join through placements. Course-scale: many bots × paging (`hasMore`). JSON fallback must match Postgres.
2. **Transcript authorization algorithm**: Exact checks (membership role ∈ {owner, facilitator} ∧ appId ∈ current placements ∧ `shared === true`). Whether bot `ownerId` still bypasses Workspace (per-bot Activity unchanged). Unplace race: session opened then bot removed.
3. **SessionList presentation**: Show **bot name and** participant on one row (Req 3.2) without breaking My sessions (`nameMode` is currently one or the other).
4. **Invite link migration**: How to collapse existing multiple active links per role; whether reset is the only revoke UX for links.
5. **Create-then-invite**: Dialog must create the Workspace before a token exists; failure/partial invite after successful create.
6. **Assisted Authoring on place**: Always overwrite bot mode (Req 4.4) including bots already ON/OFF from another Workspace; confirm no other place paths (fork, duplicate) skip the apply.
7. **Members API vs Req 1.7**: Whether Participants calling `GET .../members` should 403 after this feature, or UI hide is enough.
8. **Existing Workspace AA default**: Field absent → treat as OFF for apply-on-create/place (consistent with Req 4.2).

---

## Recommendations for design phase

Superseded by design decisions below (`$kiro-spec-design workspace-hub-improvements -y`, 2026-09-06).

### Adjacent specs (do not reimplement)

- `educator-workspaces`: roles, (a)–(d), join, placement
- `bot-activity-sessions`: recording, sharing toggle, per-bot Activity, My sessions
- `assisted-authoring-mode`: ON/OFF editor behavior, per-bot Settings

---

## Summary (design discovery)

- **Feature**: `workspace-hub-improvements`
- **Discovery Scope**: Extension (light) — integration with existing workspace, chat-session, and app-store façades; no new libraries
- **Key Findings**:
  - Hybrid (Option C) selected: extend stores/APIs/authz; new UI slices for Activity, share-link, role hint, portaled create dialog
  - Session list is a join of current placements × `listSharedSessionsForAppIds`; no `workspaceId` on `chat_sessions`
  - Workspace Activity uses dedicated list and transcript routes; `GET /api/sessions/:id` stays participant-or-bot-owner

## Research Log

### Light discovery — integration points

- **Context**: `$kiro-spec-design` extension process after `$kiro-validate-gap`
- **Sources Consulted**: Gap analysis above; `lib/workspace-store`, `workspaces-invites`, `workspaces-members`, `workspaces-placements`, `apps-gates`, `chat-session-api/transcript.ts`, `tabs.ts`, `CreateWorkspaceDialog`, `AppShell` overflow, `assisted-authoring-mode` / `bot-activity-sessions` designs
- **Findings**: Link invites already many-to-one; stacking is create-path only. Transcript has no Workspace notion. Create dialog clips because it is not portaled. `activity.viewFacilitation` already matches Owner/Facilitator.
- **Implications**: Design reuses permission action for chat Activity; new HTTP route for session list; portal for create; lazy invite collapse

### No new dependencies

- **Context**: Create overlay and tooltips
- **Sources Consulted**: React 19 (`createPortal`); existing Tailwind hover patterns
- **Findings**: Portal and native title/`?` button suffice
- **Implications**: Technology stack unchanged

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks | Notes |
|--------|-------------|-----------|-------|-------|
| A Extend only | Grow Hub/InvitePanel/store | Few files | Bloat; mix event feed with chat Activity | Rejected as sole approach |
| B New stack | New hub and session domain | Isolation | Duplicates join and session UI | Rejected |
| C Hybrid | Extend façades; new UI slices | Matches repo; clear Activity vs event feed | Transcript authz must stay tight | **Selected** |

## Design Decisions

### Decision: Placement join instead of session.workspaceId

- **Context**: Research item 1 — how to list sessions for a Workspace
- **Alternatives Considered**: Stamp `workspaceId` on sessions at record time; N× `listSessionsForApp`; `listSharedSessionsForAppIds`
- **Selected Approach**: New store method filters shared sessions whose `appId` is in the current placement set
- **Rationale**: Unplace automatically drops Activity; recording stays Workspace-agnostic
- **Trade-offs**: List work is a join at read time; Postgres uses `ANY(app_ids)` not N+1
- **Follow-up**: Stable sort `updatedAt` desc, `id`

### Decision: Workspace-scoped transcript route

- **Context**: Research item 2; design review issue 1; specifier chose the split
- **Alternatives Considered**: Extra reader on `GET /api/sessions/:id`; separate `GET /api/workspaces/:id/sessions/:sessionId`
- **Selected Approach**: Hub Activity uses the Workspace transcript route. Personal/owner `GET /api/sessions/:id` is unchanged. Gate is facilitation on **this** Workspace + current placement + `shared`
- **Rationale**: `lib/chat-session-api` stays free of `workspace-store`; operator access cannot leak in via My sessions or a guessed session id without Workspace context
- **Trade-offs**: Two transcript URLs; Activity UI must not call the personal route
- **Follow-up**: Self-tests that a Facilitator is 403 on `/api/sessions/:id` and 200 on the Workspace route when placed and shared

### Decision: SessionList nameMode workspace

- **Context**: Research item 3
- **Selected Approach**: Add `"workspace"` mode showing bot name plus participant; do not change `"bot"` / `"participant"`
- **Rationale**: Req 3.2 without breaking My sessions or per-bot Activity

### Decision: Ensure-if-missing; extras live until Reset

- **Context**: Research item 4; design review issue 2; specifier chose keep-until-reset
- **Alternatives Considered**: Lazy collapse on GET (keep newest, revoke extras immediately); keep extras joinable until Reset
- **Selected Approach**: Ensure creates a link only if the role has zero active links. UI shows one canonical URL (newest). Reset revokes all active links for that role and creates one replacement. GET/copy never revoke.
- **Rationale**: Opening Members must not break links already shared with a cohort
- **Trade-offs**: Until Reset, more than one token per role may still work; the UI does not list them
- **Follow-up**: Serialize ensure/reset per workspace in the store write lock

### Decision: Two-phase create dialog via portal

- **Context**: Research items 5 and clipping
- **Selected Approach**: `createPortal` to `document.body`; create first; then optional invite in the same dialog; Done navigates to hub
- **Rationale**: Invite tokens need `workspaceId`; create failure must not imply a Workspace exists (5.7)
- **Trade-offs**: If invite fails after create, Workspace still exists (honest; 5.5)

### Decision: Apply AA default only on first placement

- **Context**: Research items 6 and 8
- **Selected Approach**: `updateApp` mode when a placement is newly inserted (place and create-into). Missing column/JSON key → false. Idempotent re-place does not re-apply
- **Rationale**: Matches 4.5 (later default change does not rewrite) and avoids clobbering a per-bot override on accidental re-place
- **Follow-up**: Duplicate/fork do not auto-place today — no extra hook

### Decision: Members GET requires members.manage

- **Context**: Research item 7 / Req 1.7
- **Selected Approach**: Participants 403 on members and invites list; self-leave DELETE unchanged; hub does not fetch roster for Participants
- **Rationale**: UI hide alone leaks roster via API
- **Trade-offs**: Breaking change for any Participant client that listed members — none in current hub beyond the Members tab

## Synthesis

- **Generalization**: Admin surfaces (Settings, Members, Activity, invites) share `members.manage` / `activity.viewFacilitation` / `workspace.updatePermissions`; tab visibility is a function of those roles, not a fourth role model
- **Build vs adopt**: Adopt existing session list/transcript, invite tokens, permission matrix, `createPortal`; build only ensure/reset, placement-scoped session list, and AA default field
- **Simplification**: No feature flag; no event-feed reuse; no `workspaceId` on chat sessions; no new tooltip library

## Risks & Mitigations

- Transcript over-read — Workspace route re-checks placement and shared; personal transcript route unchanged
- Ensure/reset races — serialize per workspace in the store
- Participant members 403 — ship UI and API together
- Create dialog invite after create — show Workspace exists if invite fails; do not roll back create

## References

- `.kiro/specs/educator-workspaces/design.md`
- `.kiro/specs/bot-activity-sessions/design.md`
- `.kiro/specs/assisted-authoring-mode/design.md`
- `.kiro/steering/tech.md`, `structure.md`
