# Implementation Plan

## 1. Foundation: Workspace default, tabs, session query, role copy

- [x] 1.1 Persist the Workspace Assisted Authoring default
  - Add a Workspace-level Assisted Authoring default that is false for new records in both storage backends; missing stored values read as false
  - Do not expose create/PATCH HTTP for this field in this task
  - A newly created Workspace record has the default off when loaded from either store
  - _Requirements: 4.2_
  - _Boundary: WorkspaceStore_

- [x] 1.2 (P) Resolve hub tabs by membership role
  - Participant-visible tabs are Bots only; Owner and Facilitator tabs are Bots, Settings, Members, and Activity; Invites is not a tab
  - The Activity tab label is “Activity”; Participant disallowed section URLs resolve to Bots; operator Invites URLs resolve to Members
  - Role helpers return those tab sets and URL resolutions without rendering the hub
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Boundary: WorkspaceTabs_

- [x] 1.3 (P) List shared sessions across many bots
  - Query shared chat sessions for a set of bot ids in both stores, paginated; empty id set yields an empty page
  - Order by most recent activity first (updated time descending, stable id tie-break); unshared sessions are excluded
  - The same page of shared summaries is returned for equivalent ids in both stores
  - _Requirements: 3.1, 3.4_
  - _Boundary: chat-session-store_

- [x] 1.4 (P) Provide short role explanations
  - Keep display names Owner, Facilitator, and Participant
  - Copy states that the Owner administers, deletes, and transfers; a Facilitator does the same except delete or change/remove the Owner; a Participant uses the Workspace by building permissions and cannot change Settings, manage members, or view Activity
  - Hover or “?” surfaces can read this copy without renaming roles
  - _Requirements: 6.3, 6.4_
  - _Boundary: WorkspaceRoleHint_

## 2. Reusable invitation links

- [x] 2.1 Ensure and reset one current link per join role
  - Create a link invite for a role only when that role has none; redisplay and copy never revoke extra legacy links
  - Reset revokes every active link for that role, then creates one replacement; existing email/link accept still joins at the invite role; tokens from before reset are no longer valid
  - After ensure, copying does not add a second active link; after reset, the old URL cannot join
  - _Requirements: 2.3, 2.6, 2.9, 2.10, 2.11_
  - _Boundary: WorkspaceStore_
  - _Depends: 1.1_

- [x] 2.2 Expose operator invite APIs for share links and pending email
  - Operators receive one current URL per Facilitator and Participant role plus pending emails; POST records email invites or resets a role’s link; DELETE revokes a pending email
  - Participants cannot create, copy as operators, reset, or revoke; GET/copy does not stack links or revoke extras
  - An operator GET shows one URL per role; reset returns a new URL; Participant calls are forbidden
  - _Requirements: 2.2, 2.4, 2.6, 2.8, 2.9, 2.12_
  - _Boundary: WorkspaceInvitesAPI_
  - _Depends: 2.1_

- [x] 2.3 Build the share-link control
  - Role picker (Facilitator or Participant, not Owner), shown URL, copy, and reset in one place; no Active invites list of links
  - Role explanations appear on the picker via hover or “?” only
  - Copy puts the currently shown URL on the clipboard; reset replaces the shown URL
  - _Requirements: 2.1, 2.4, 2.5, 2.7, 6.1_
  - _Boundary: WorkspaceShareLinkControl_
  - _Depends: 2.2, 1.4_

## 3. Members roster and pending invites

- [x] 3.1 Restrict the member list to operators and include pending emails
  - Listing members requires member management; Participants receive forbidden; operators also receive pending email invites
  - A Participant can still leave via the existing self-leave path without receiving the roster
  - Participant list calls fail; operator list includes not-yet-joined email invitees; self-leave still succeeds
  - _Requirements: 1.6, 1.7, 2.8, 2.12_
  - _Boundary: WorkspaceMembersAPI_

- [x] 3.2 Compose email invite, share link, pending rows, and role hints on Members
  - Operators invite by email and invitation link from Members; pending emails appear as not-yet-joined people; no Active invites link list
  - Role explanations appear on roster role labels via hover or “?”; Participant hub does not show roster or invite controls
  - Members shows invite controls and pending rows for operators and neither for Participants
  - _Requirements: 1.7, 2.1, 2.8, 6.2_
  - _Boundary: WorkspaceMemberList_
  - _Depends: 2.3, 3.1_

## 4. Workspace Activity APIs

- [x] 4.1 List shared sessions for currently placed bots
  - Operators with facilitation list shared sessions for bots currently placed in that Workspace, including bots they do not own, newest first
  - Each listed session includes bot name, participant display name or Anonymous, start time, and public versus editor-test; unshared and unplaced bots are excluded; empty placements yield an empty list; membership/placement event history is not used
  - Participants and non-members are denied; an operator list matches shared sessions of current placements only
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8_
  - _Boundary: WorkspaceSessionsAPI_
  - _Depends: 1.3_

- [x] 4.2 Read a Workspace Activity transcript without widening personal transcripts
  - Operators may open a listed session’s full transcript when it is shared and the bot is currently placed in this Workspace
  - Unshared, unplaced, or Participant access is denied; the personal session transcript route stays participant-or-bot-owner only (a Facilitator who is neither still cannot use it)
  - A shared placed session returns the record on the Workspace transcript route; the personal route is unchanged for that Facilitator
  - _Requirements: 3.3, 3.4, 3.7_
  - _Boundary: WorkspaceSessionsAPI_
  - _Depends: 4.1_

## 5. Apply Assisted Authoring default and Workspace write API

- [x] 5.1 (P) Apply the Workspace Assisted Authoring default on first add
  - Creating a bot into a Workspace and first placing a bot set that bot’s Assisted Authoring to the Workspace default in effect then
  - Idempotent re-place does not re-apply; changing the Workspace default later does not rewrite existing bots; per-bot Settings can still change the mode
  - A newly added bot matches the current default; a second place of the same bot and a later default change leave existing bots unchanged
  - _Requirements: 4.3, 4.4, 4.5, 4.6_
  - _Boundary: AppsGates, Placements_
  - _Depends: 1.1_

- [x] 5.2 (P) Accept building permissions and Assisted Authoring default on Workspace write
  - Create accepts optional building permissions (omitted stays all off, including peer bot visibility); Assisted Authoring default is always off at create and is not taken from the create body
  - PATCH can change the default without rewriting existing bots; GET includes the field; Participants cannot PATCH
  - Create without permissions overlay leaves (b) off; PATCH default succeeds for operators and is forbidden for Participants
  - _Requirements: 4.2, 4.5, 4.7, 5.2, 5.3, 5.7, 5.8, 7.1_
  - _Boundary: workspaces-crud_
  - _Depends: 1.1_

- [x] 5.3 Add the Settings control for the Assisted Authoring default
  - Owners and Facilitators can set the Workspace default ON or OFF; Participants cannot
  - Save failure shows an error and does not present the new value as saved
  - Settings shows the control for operators; a failed save leaves the previous value on screen
  - _Requirements: 4.1, 4.7, 4.8_
  - _Boundary: WorkspacePermissionsForm_
  - _Depends: 5.2_

## 6. Workspace Activity browse UI

- [x] 6. Show shared sessions and read-only transcripts in Activity
  - List shows bot name, participant or Anonymous, start time, and public versus editor-test; empty state explains sessions appear after placed bots are used with sharing on
  - Opening a row loads the Workspace transcript route (not the personal transcript URL); no edit or delete; this view is chat sessions, not the membership/placement event feed
  - An operator can browse the list and open a read-only transcript; sharing-off sessions never appear
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.8, 3.9_
  - _Boundary: WorkspaceActivityView_
  - _Depends: 4.2_

## 7. Viewport create dialog

- [x] 7. Create a Workspace with permissions and optional invite in a viewport dialog
  - The dialog is not clipped to the sidebar; it requires a name and shows the four building-permission toggles starting all off, with no Assisted Authoring control
  - After successful create, inviting is optional using the same email and share-link pattern as Members; skipping invite is allowed; create failure does not create a Workspace; success makes the creator Owner and opens the hub
  - The overlay is readable at viewport size; create with toggled permissions persists those values; invite skip still lands on the new Workspace
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 7.1_
  - _Boundary: CreateWorkspaceDialog_
  - _Depends: 2.3, 5.2_

## 8. Hub integration

- [x] 8. Wire role-visible tabs, Activity, leave, and post-create Settings/Members
  - The hub renders only role-visible tabs; operators see Members (with invites already on that section) and Activity, not an Invites tab; Participants see Bots and can leave without admin sections
  - After create, operators can still change building permissions and the Assisted Authoring default in Settings and invite from Members
  - Peer bot visibility listing rules stay as they are: membership alone does not reveal others’ placed bots
  - Participant hub shows only Bots plus leave; operator hub shows Bots, Settings, Members, and Activity with the Activity browse view
  - _Requirements: 1.1, 1.2, 1.6, 1.7, 2.12, 3.7, 3.8, 5.6, 7.2, 7.3, 7.4_
  - _Boundary: WorkspaceHub_
  - _Depends: 1.2, 3.2, 5.3, 6_

## 9. Validation

- [x] 9.1 Cover hub, invite, Activity, default-apply, and visibility selftests
  - Tab resolve (including Invites → Members and Participant admin URLs → Bots); ensure does not stack; GET does not revoke extras; reset invalidates all prior active tokens for that role
  - Members list forbidden for Participants; Workspace session list/transcript gates; personal transcript still denied for a Facilitator who is not owner or participant
  - Assisted Authoring apply on create-into and first place, no rewrite on re-place or PATCH default; create permissions overlay; existing placement listing with peer visibility off and on
  - The selftests for those cases pass with `npx tsx`
  - _Requirements: 1.4, 2.6, 2.9, 3.7, 4.3, 4.4, 7.2, 7.3, 7.4_
  - _Depends: 8_

- [x] 9.2 Verify the operator and Participant hub flows
  - Participant hub is Bots plus leave; operator Members copy of the shown share link works; create dialog is not clipped by the sidebar
  - Activity lists shared sessions across two placed bots; a session with sharing off is hidden
  - Those flows behave as specified when exercised in the app
  - _Requirements: 1.1, 1.6, 2.5, 3.1, 3.4, 5.1_
  - _Depends: 8_

## Implementation Notes

- 1.2: Removing `"invites"` from `WorkspaceTab` unmounted `WorkspaceInvitePanel` from the hub; operators cannot reach invite UI until 3.2 composes it onto Members. Activity nav has no browse view until tasks 6/8.
- 2.1: ensure/reset mint `createdByUserId` as the Workspace Owner (two-arg store signature); actor identity is task 2.2.
- 2.2: GET invites payload is `{ linkByRole, pendingEmails }`; POST `kind:"link"` is 400. `WorkspaceInvitePanel` / `lib/workspace-ui/invites.ts` still parse the old `{ invites }` list until 2.3/3.2.
- 3.2: `WorkspaceInvitePanel` was deleted; Members hosts email + share-link. Participant self-leave is no longer on Members (`return null` when they cannot load the roster); leave on Bots is task 8.
- 5.1: `applyWorkspaceAssistedAuthoringDefault` lives in `lib/workspace-api/apply-assisted-authoring-default.ts`; first place of a bot with undefined AA into a default-OFF Workspace now writes false.
- 9.2: Postgres `listSharedSessionsForAppIds` uses `sql.query` with `ANY($1::text[])` because tagged `sql` cannot interpolate `string[]` (`Primitive` only).
- Workspace selftests use `npx tsx`; this environment needs unrestricted sandbox (`all`) due to IPC pipe EPERM.
