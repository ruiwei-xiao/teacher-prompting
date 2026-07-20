# Implementation Plan

## 1. Foundation: types, permissions, and persistence

- [x] 1.1 Define Workspace domain types
  - Capture Workspace, roles (Owner / Facilitator / Participant), building permissions (a–d), membership, invite (email|link), placement, and activity event shapes per design
  - Types compile and are importable by store and permission modules with no `any`
  - _Requirements: 3.1, 5.1_
  - _Boundary: WorkspaceStore_

- [x] 1.2 Implement permission evaluation
  - Implement role × building-permission × action checks including Playlab-scoped permission (c) (same-Workspace share always allowed; beyond-Workspace gated only with Workspace context; Publish never gated)
  - Evaluator returns allow/deny for Owner, Facilitator, and Participant sample matrices covering create, see-others, share-outside, manage-own, delete Workspace, and manage members
  - _Requirements: 3.2, 3.3, 3.4, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - _Boundary: Permissions_

- [x] 1.3 Persist workspaces and memberships
  - Dual-store (Postgres + JSON fallback) for Workspace CRUD and memberships; new Workspaces default all building permissions off; creator becomes Owner; support ≥100 members with indexed member queries
  - Creating a Workspace and listing memberships for a user works in both storage modes
  - _Requirements: 1.1, 1.5, 2.6, 3.1, 3.2, 9.1_
  - _Boundary: WorkspaceStore_

- [x] 1.4 Persist invites and placements
  - Store invite records (email pending + link tokens with revoke/expiry) and bot↔Workspace placements without changing bot ownership
  - Same bot can be placed in multiple Workspaces; placement uniqueness enforced per Workspace
  - _Requirements: 2.1, 2.2, 2.4, 4.1, 4.2, 4.3_
  - _Boundary: WorkspaceStore_

- [x] 1.5 Persist lightweight activity
  - Append/list helpers for member join/leave/removed, bot placed/unplaced, workspace renamed, permissions updated (not Workspace-delete append; delete cascades related rows)
  - Facilitator/Owner vs Participant visibility filtering can be applied when listing
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary: ActivityLog_

- [x] 1.6 Protect Workspace routes at the auth edge
  - Require sign-in for Workspace pages and Workspace APIs with callbackUrl return (including invite join landing)
  - Unauthenticated access to those paths redirects to sign-in rather than rendering member content
  - _Requirements: 8.3, 8.4_
  - _Boundary: WorkspacesAPI_

## 2. Workspace HTTP APIs

- [x] 2.1 Expose Workspace list, create, get, update, and delete APIs
  - Enforce Owner/Facilitator/Participant rules; Facilitators may rename and update building permissions; only Owner may delete; append activity on rename and permissions change; on delete remove memberships/invites/placements/activity without deleting bots
  - Signed-in Owner can create and later delete; Participant receives forbidden on settings/delete mutations
  - _Requirements: 1.1, 1.4, 2.6, 3.2, 3.3, 3.4, 3.6, 5.10, 6.3, 8.1_
  - _Boundary: WorkspacesAPI_

- [x] 2.2 (P) Expose membership management APIs
  - List/search members, change roles, remove members, self-leave, and ownership transfer (sole Owner; demote previous Owner); append activity for join/leave/removed as applicable
  - Search filters a large roster; self-leave removes Workspace from the user’s list; non-members get forbidden
  - _Requirements: 2.5, 3.2, 3.3, 3.5, 3.6, 6.1, 8.1, 9.1, 9.3_
  - _Boundary: WorkspacesAPI_
  - _Depends: 1.3, 1.5_

- [x] 2.3 Expose invite and join APIs
  - Create/revoke email and link invites (Facilitator or Participant roles only); accept valid link tokens; reject revoked/expired; append join activity
  - Valid link join adds membership; revoked/expired join returns not-found/gone with clear error
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 8.3, 8.4, 9.2_
  - _Boundary: WorkspacesAPI_
  - _Depends: 1.4, 1.5_

- [x] 2.4 Expose activity feed API
  - Role-filtered chronological activity for a Workspace (facilitation vs limited participant view)
  - Owners/Facilitators see membership and settings events; Participants do not see facilitation-only membership management details
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary: WorkspacesAPI_
  - _Depends: 1.5, 2.1_

## 3. Placements, peer inspect, and fork

- [x] 3.1 Expose placement APIs
  - Place/unplace/list with ownership and building-permission rules; Facilitators/Owners may remove others’ placements without deleting bots; append place/unplace activity
  - Placing a bot keeps a single personal owner; removing placement leaves the bot in My bots
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.8, 5.9, 6.2_
  - _Boundary: WorkspacesAPI_
  - _Depends: 1.4, 1.5, 1.2_

- [ ] 3.2 (P) Extract shared bot fork helper
  - Shared fork creates a caller-owned copy with attribution metadata and empty provider secret; refactor existing project duplicate to use it without behavior change
  - Project duplicate still produces a new owned bot; Workspace duplicate can call the same helper later
  - _Requirements: 4.7_
  - _Boundary: AppForkHelper_

- [ ] 3.3 Provide peer read-only bot snapshot API
  - Members who may view a placed bot receive a secret-stripped snapshot; non-owners still cannot edit via apps PATCH
  - Snapshot omits provider secrets; forbidden when permission (b) hides others’ bots from Participants
  - _Requirements: 4.6, 4.7, 5.3, 5.4, 8.1_
  - _Boundary: WorkspacesAPI_
  - _Depends: 3.1_

- [ ] 3.4 Provide peer duplicate API
  - After ACL, duplicate a visible placed bot into the caller’s My bots via the shared fork helper
  - Caller becomes owner of the new bot; source bot ownership unchanged
  - _Requirements: 4.7_
  - _Boundary: WorkspacesAPI_
  - _Depends: 3.2, 3.3_

## 4. Apps API gates and share UI context

- [ ] 4.1 Gate educator share and self-delete from apps APIs
  - With Workspace context, enforce permission (c) on educator-outward fields only and permission (d) on delete; never gate Publish; surface denials in delete UI
  - Publish succeeds while (c) is off; shareProject with Workspace context and (c) off returns forbidden for Participants; delete UI shows policy denial when (d) blocks
  - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9, 7.2, 7.4_
  - _Boundary: AppsAPIGates_
  - _Depends: 1.2, 1.4_

- [ ] 4.2 Support create-then-place via apps create API
  - Optional Workspace context on create places the new bot when role/permission (a) allows
  - Allowed create returns a bot listed in that Workspace placements; denied create-into-Workspace does not place
  - _Requirements: 5.2, 1.3_
  - _Boundary: AppsAPIGates_
  - _Depends: 3.1_

- [ ] 4.3 Pass Workspace context from share UI
  - When sharing from a Workspace surface, include Workspace context so permission (c) can apply; show forbidden messaging when blocked
  - Share from Workspace hub with (c) off blocks educator outward share for Participants; share without Workspace context does not apply (c)
  - _Requirements: 5.5, 5.6, 7.4_
  - _Boundary: AppsAPIGates_
  - _Depends: 4.1_

## 5. Pending email invite acceptance

- [ ] 5.1 Accept pending email invites on sign-in
  - When a session has user email, accept matching pending email invites into memberships automatically
  - User invited by email becomes a Workspace member after sign-in with that email without a separate accept click
  - _Requirements: 2.1, 2.3_
  - _Boundary: WorkspaceStore_
  - _Depends: 1.4, 2.3_

## 6. Educator Workspace UI

- [ ] 6.1 Replace placeholder navigation with live Workspaces
  - Primary educator navigation lists memberships, supports create, and opens hubs; remove hard-coded example Workspace names
  - Educator with memberships sees real names; educator with none can still create and use My bots
  - _Requirements: 1.1, 1.2, 1.5_
  - _Boundary: Workspace UI_
  - _Depends: 2.1_

- [ ] 6.2 Build Workspace hub with filtered bot grid and place/unplace
  - Show Workspace bots distinct from My bots; filter by role × permission (b); allow place/unplace per role and permissions (a)/(d)
  - Participant with (b) off sees only own placements; Facilitator sees all placed bots; place/unplace updates the grid
  - _Requirements: 1.3, 4.2, 4.4, 4.5, 5.2, 5.3, 5.4, 5.8, 5.9_
  - _Boundary: Workspace UI_
  - _Depends: 3.1, 6.1_

- [ ] 6.3 Build Workspace settings UI
  - Facilitators and Owners can rename and edit building permissions; only Owner can delete the Workspace
  - Facilitator save updates permissions for subsequent member actions; Participant cannot open destructive Owner-only delete
  - _Requirements: 1.4, 3.2, 3.3, 3.4, 5.1, 5.10_
  - _Boundary: Workspace UI_
  - _Depends: 2.1, 6.1_

- [ ] 6.4 (P) Build members UI
  - Searchable member list with role changes, remove, ownership transfer, and self-leave for authorized roles
  - Search narrows a long roster; leave/remove stops Workspace access for that user
  - _Requirements: 2.5, 3.2, 3.3, 3.5, 9.1, 9.3_
  - _Boundary: Workspace UI_
  - _Depends: 2.2, 6.1_

- [ ] 6.5 (P) Build invite UI
  - Email pending invite recording and copyable invite links with revoke; clear copy that email is not SMTP-delivered
  - Operator can copy a link and record an email invite from the panel
  - _Requirements: 2.1, 2.2, 2.4, 9.2_
  - _Boundary: Workspace UI_
  - _Depends: 2.3, 6.1_

- [ ] 6.6 (P) Build activity feed UI
  - Chronological feed using role-filtered activity API
  - Facilitator sees recent join/place/permission events; Participant feed omits facilitation-only membership management details
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary: Workspace UI_
  - _Depends: 2.4, 6.1_

- [ ] 6.7 Build peer preview and duplicate UI
  - Non-edit inspect of a visible peer bot with duplicate into My bots; no authoring edit controls for non-owners
  - Duplicate creates a new bot under the viewer; source remains owned by original author
  - _Requirements: 4.6, 4.7_
  - _Boundary: PeerBotPreview_
  - _Depends: 3.3, 3.4, 6.2_

- [ ] 6.8 Build invite join landing
  - Signed-in user joining via token lands in the Workspace; signed-out user is sent through sign-in with return to join
  - Successful join shows the Workspace hub; invalid link shows no-longer-valid messaging
  - _Requirements: 2.2, 2.4, 8.3, 8.4, 9.2_
  - _Boundary: Workspace UI_
  - _Depends: 2.3, 1.6_

## 7. Create-flow UI and validation

- [ ] 7.1 Optional place-into-Workspace on create UI
  - Create flow can target a Workspace when allowed; does not require a Workspace for personal create
  - Creating into an allowed Workspace shows the bot in that hub; personal create still appears under My bots
  - _Requirements: 1.5, 5.2, 7.1_
  - _Boundary: Workspace UI_
  - _Depends: 4.2, 6.1_

- [ ] 7.2 Run end-to-end authz and coexistence checklist
  - Manually verify roles, building permissions a–d, Publish ungated by (c), placement does not Community-publish, invite sign-in, 100+ member search, and My bots/Community regression
  - Checklist results recorded as pass/fail notes for the above scenarios with no unresolved blockers
  - _Requirements: 1.5, 5.7, 7.1, 7.2, 7.3, 7.4, 7.5, 8.2, 8.4, 9.1, 9.2, 9.3_
  - _Depends: 4.1, 4.3, 5.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 7.1_

- [ ]* 7.3 Add automated permission-matrix tests when a test runner exists
  - Cover Owner vs Facilitator delete, (b)/(c)/(d) Participant matrices, and Publish ungated by (c) from requirements acceptance criteria
  - Deferred until the repository adopts an automated test runner
  - _Requirements: 3.2, 3.3, 5.3, 5.5, 5.7, 5.8_

## Implementation Notes

- Workspace selftests use `npx tsx`; in this environment tsx may need unrestricted sandbox (`all`) due to IPC pipe EPERM.
- Prefer `npx tsx` over `node --experimental-strip-types` for `lib/workspace-store/*.selftest.ts`.
- Email invites stay non-revoked after accept; task 5.1 / leave flows should avoid re-adding via `acceptPendingEmailInvitesForUser` (revoke or mark consumed when wiring auth).
