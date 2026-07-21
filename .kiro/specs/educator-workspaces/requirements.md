# Requirements Document

## Introduction

Teacher Prompting helps educators author, evaluate, and publish AI tutoring bots. Today, bots are organized only as a flat personal list (“My bots”), with peer discovery via Community and link-based project sharing. This specification adds Playlab-like **Workspaces**: educator-only spaces for a course, cohort, small group, or personal team where members can be invited, bots can be placed while remaining personally owned, building permissions can shape collaboration, and facilitators can see lightweight activity.

Primary users are teachers and other educator-builders (expected course scale: 100+ accounts). Student end-users of published tutoring chats are not Workspace members; existing Publish and Community behaviors remain unchanged. Organization hierarchy, Collections, and deeper insights are deferred to `workspace-collections`.

## Boundary Context

- **In scope**:
  - Creating, renaming, navigating, and deleting Workspaces
  - Inviting and managing educator members (email invite and invite link)
  - Basic roles: Owner, Facilitator, Participant
  - Personal bot ownership with placement into one or more Workspaces
  - Building permissions that control create-in-workspace, peer visibility, outward sharing, and self-management of placed bots
  - Lightweight Workspace activity visible to facilitators (and limited participant-facing activity where appropriate)
  - Clear separation from My bots, student Publish, project share, and Community
- **Out of scope**:
  - Organization (school/district) hierarchy
  - Collections / curated multi-bot distribution packs
  - Deep analytics, exports, moderation queues, or cross-Workspace insights products
  - Making students Workspace members or replacing the student Publish/chat delivery model
  - Co-editing another educator’s bot (shared edit rights on a single bot)
  - Starred / Recently Used personal library features (existing UI placeholders may remain non-functional or be removed without replacing them in this feature)
- **Adjacent expectations**:
  - Existing personal bot create/edit/delete, Publish → student chat, project share → peer view/duplicate, and Community gallery continue to work as today unless a building permission explicitly restricts an outward share action for a Participant
  - `workspace-collections` will build on Workspaces for Collections, richer insights, and optional Organization later
  - Authentication and individual user accounts already exist; Workspaces add membership on top of signed-in educators

## Requirements

### Requirement 1: Workspace creation and navigation

**Objective:** As an educator, I want to create and open Workspaces for a course, cohort, group, or my own team, so that shared work has a clear place beyond my flat bot list.

#### Acceptance Criteria

1. When a signed-in educator chooses to create a Workspace, the Teacher Prompting System shall create a Workspace with a name they provide and make them its Owner.
2. When an educator belongs to one or more Workspaces, the Teacher Prompting System shall let them see and open those Workspaces from the primary educator navigation (not only from a non-functional placeholder).
3. When an educator opens a Workspace, the Teacher Prompting System shall show that Workspace’s bots (subject to building permissions and role) distinctly from the personal “My bots” list.
4. When an Owner renames a Workspace, the Teacher Prompting System shall show the updated name to all members on subsequent views.
5. If an educator has no Workspace memberships, the Teacher Prompting System shall still allow them to create a Workspace and continue using personal My bots without requiring a Workspace.

### Requirement 2: Membership invitations

**Objective:** As a Workspace Owner or Facilitator, I want to invite other educators by email or invite link, so that a course of many participants can join without one-by-one account provisioning by engineering.

#### Acceptance Criteria

1. When an Owner or Facilitator invites an educator by email address, the Teacher Prompting System shall offer membership in that Workspace at a chosen role of Facilitator or Participant (Owner assignment is not granted by ordinary invite).
2. When an Owner or Facilitator creates an invite link for a Workspace, the Teacher Prompting System shall allow a signed-in educator who opens a valid link to join that Workspace at the role configured on the link (Facilitator or Participant).
3. If an invited email already belongs to a signed-in account that accepts the invite, the Teacher Prompting System shall add that account as a member without requiring a second account.
4. If an invite link is revoked or expired, the Teacher Prompting System shall reject new joins through that link and inform the user that the invite is no longer valid.
5. When a member leaves or is removed from a Workspace, the Teacher Prompting System shall stop showing that Workspace in their Workspace list and shall stop granting them Workspace-scoped access.
6. The Teacher Prompting System shall not require Organization membership in order to create Workspaces or invite educators.

### Requirement 3: Roles and administration

**Objective:** As a course facilitator, I want basic Workspace roles, so that day-to-day management is possible without giving every member delete rights.

#### Acceptance Criteria

1. The Teacher Prompting System shall support exactly three Workspace roles for this feature: Owner, Facilitator, and Participant.
2. While a user is the Owner, the Teacher Prompting System shall allow them to manage members, building permissions, Workspace settings, activity visibility for facilitation, and deletion of the Workspace.
3. While a user is a Facilitator, the Teacher Prompting System shall allow them to manage members (except changing or removing the Owner), manage building permissions and settings, and view facilitation activity, and shall not allow them to delete the Workspace.
4. While a user is a Participant, the Teacher Prompting System shall allow Workspace use according to building permissions and shall not allow them to change Workspace settings, manage other members’ roles, or delete the Workspace.
5. When an Owner transfers ownership to another member, the Teacher Prompting System shall make the recipient the sole Owner and shall demote the previous Owner to Facilitator or Participant as chosen during transfer.
6. If a Participant attempts an Owner- or Facilitator-only action, the Teacher Prompting System shall deny the action and show that they lack permission.

### Requirement 4: Personal ownership and multi-Workspace placement

**Objective:** As an educator, I want to keep owning my bots while placing them into one or more Workspaces, so that course groups can see shared work without taking ownership away from me.

#### Acceptance Criteria

1. The Teacher Prompting System shall keep a single personal owner for each bot after the bot is placed in a Workspace.
2. When a bot owner who is a Workspace member places their bot into that Workspace, the Teacher Prompting System shall list the bot in that Workspace for members who are allowed to see it.
3. When a bot owner places the same bot into additional Workspaces where they are a member, the Teacher Prompting System shall show that bot in each of those Workspaces without creating separate owned copies solely for placement.
4. When a bot owner removes their bot from a Workspace, the Teacher Prompting System shall remove it from that Workspace’s bot list and shall retain the bot in the owner’s personal My bots (unless the owner separately deletes the bot).
5. When an Owner or Facilitator removes another member’s bot from the Workspace, the Teacher Prompting System shall remove only the Workspace placement and shall not delete the underlying bot from the owner’s account.
6. While a user is not the bot owner, the Teacher Prompting System shall not allow them to edit that bot’s authoring content through Workspace membership alone.
7. Where peer viewing is allowed for a placed bot, the Teacher Prompting System shall let permitted members inspect or use the bot in a non-edit capacity consistent with product surfaces, and shall continue to support existing duplicate/fork behavior for reuse.

### Requirement 5: Building permissions

**Objective:** As a Workspace Owner or Facilitator, I want building permission toggles, so that a course can start conservative and open collaboration as the activity requires.

#### Acceptance Criteria

1. The Teacher Prompting System shall provide these Workspace building permissions, each independently toggleable by Owner or Facilitator: (a) members may create bots into this Workspace, (b) members may see each other’s placed bots, (c) members may place bots into other Workspaces and use educator-oriented outward sharing, (d) members may manage their own placed bots (remove from Workspace and delete their own bots).
2. When permission (a) is off, the Teacher Prompting System shall prevent Participants from creating a new bot placement into that Workspace, while still allowing Owners and Facilitators to place bots they own.
3. When permission (b) is off, the Teacher Prompting System shall show a Participant only the placed bots they own in that Workspace, while Owners and Facilitators can still see all placed bots for facilitation.
4. When permission (b) is on, the Teacher Prompting System shall let Participants browse other members’ bots that are placed in that Workspace.
5. When permission (c) is off, the Teacher Prompting System shall prevent Participants from placing a bot from this Workspace into another Workspace and from using educator-oriented outward sharing (project share to other educators and Community-oriented sharing); Owners and Facilitators remain able to perform those educator-oriented actions as needed for facilitation.
6. When permission (c) is on, the Teacher Prompting System shall allow Participants to place their bots into other Workspaces they belong to and to use existing project-share and Community-oriented educator sharing flows subject to those features’ own rules.
7. The Teacher Prompting System shall not use permission (c) to block student-facing Publish of a bot the Participant owns; Publish to students remains available under existing Publish rules regardless of this toggle.
8. When permission (d) is off, the Teacher Prompting System shall prevent Participants from removing their bot from the Workspace or deleting their bot; Owners and Facilitators may still remove placements for facilitation.
9. When permission (d) is on, the Teacher Prompting System shall allow Participants to remove their own placements and delete their own bots.
10. When an Owner or Facilitator changes a building permission, the Teacher Prompting System shall apply the new rule to subsequent member actions in that Workspace.

### Requirement 6: Lightweight activity

**Objective:** As a course facilitator, I want a simple activity view for a Workspace, so that I can see recent membership and bot-placement events without a full analytics product.

#### Acceptance Criteria

1. When a member joins or leaves a Workspace, the Teacher Prompting System shall record an activity entry visible to that Workspace’s Owners and Facilitators.
2. When a bot is placed into or removed from a Workspace, the Teacher Prompting System shall record an activity entry visible to Owners and Facilitators.
3. When building permissions or the Workspace name change, the Teacher Prompting System shall record an activity entry visible to Owners and Facilitators.
4. While a user is a Participant, the Teacher Prompting System shall not expose facilitation-only membership management details in activity; where participant-facing activity is shown, it shall be limited to bot placement/removal events for bots that Participant is allowed to see.
5. The Teacher Prompting System shall present activity as a chronological list of recent events for the Workspace (not cross-Workspace org-wide dashboards, exports, or graded analytics).

### Requirement 7: Coexistence with My bots, Publish, and Community

**Objective:** As an educator, I want Workspaces to complement existing personal and public flows, so that course collaboration does not break publishing to students or Community discovery.

#### Acceptance Criteria

1. The Teacher Prompting System shall keep the personal My bots list available regardless of Workspace membership.
2. When a bot is published for students, the Teacher Prompting System shall continue to deliver the student-facing chat experience without requiring the student to join a Workspace.
3. When a bot appears in Community under existing Community rules, the Teacher Prompting System shall not require Workspace membership for Community discovery, and Workspace placement alone shall not publish a bot to Community.
4. The Teacher Prompting System shall keep educator project-share view/duplicate behavior available as an adjacent peer-sharing path, subject to Requirement 5’s outward-sharing permission for Participants.
5. The Teacher Prompting System shall treat Workspace membership as educator-builder access only and shall not model students as Workspace members for consuming published chats.

### Requirement 8: Access control and privacy

**Objective:** As an educator, I want Workspace contents limited to members (and role rules), so that course work is not globally visible by default.

#### Acceptance Criteria

1. If a signed-in user is not a member of a Workspace, the Teacher Prompting System shall deny access to that Workspace’s member list, activity, settings, and non-public placed-bot listings.
2. When a bot is placed only in private Workspaces and is not published or publicly project-shared, the Teacher Prompting System shall not expose that bot through Community or anonymous public educator browse solely because of Workspace placement.
3. The Teacher Prompting System shall only allow Workspace invites and joins for signed-in educator accounts (the same class of users who can create/edit bots today), not for anonymous visitors.
4. If a user opens an invite or Workspace URL without signing in, the Teacher Prompting System shall require sign-in before completing join or showing member-only Workspace content.

### Requirement 9: Course-scale usability

**Objective:** As a course operator, I want Workspaces usable for 100+ educator participants, so that a professional-learning cohort can run without an Organization layer.

#### Acceptance Criteria

1. The Teacher Prompting System shall allow a single Workspace to have at least 100 member educators.
2. When many members join via invite link during a short window, the Teacher Prompting System shall accept valid joins without requiring the operator to create accounts manually for each participant.
3. The Teacher Prompting System shall let Owners and Facilitators find and remove members from a membership list suitable for course-sized Workspaces (search or equivalent filtering when the list is long).
