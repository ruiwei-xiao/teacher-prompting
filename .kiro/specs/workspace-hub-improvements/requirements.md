# Requirements Document

## Introduction

Teacher Prompting already provides educator Workspaces with roles (Owner, Facilitator, Participant), building permissions, invites, and bot placement. Owners, Facilitators, and Participants use a Workspace to run a course or cohort, but the hub currently shows every section to every member, keeps invites on a separate tab, and offers no Workspace-level view of chat activity across placed bots. Creating a Workspace only asks for a name in a small sidebar dialog, so the four building permissions and inviting are easy to miss. Role names have no short explanation. Assisted Authoring Mode exists only per bot.

This specification improves the existing Workspace hub. It does not add a new product area, rename Owner to Admin, or change the default of building permission (b) (“members may see each other’s placed bots”). New Workspaces still start with peer bot visibility off; joining a Workspace does not by itself reveal other members’ placed bots. Invite links become reusable share links (one current URL per join role), not a growing list of one-off links.

Primary users are teachers and other educator-builders who already use Workspaces. Student end-users of published chats remain outside Workspace membership.

## Boundary Context

- **In scope**:
  - Showing only Workspace hub tabs the signed-in member is allowed to use
  - Moving invite (email and reusable invitation link) onto Members, including an invite action, and removing Invites as its own tab
  - Replacing the Active invites list of invite links with a Google Docs–style control: choose a join role, see that role’s current URL, copy it; one URL may be used by many people
  - Showing pending email invites on Members as not-yet-joined people rather than in an Active invites link list
  - A Workspace Activity tab for Owners and Facilitators that lists shared chat sessions for every bot placed in that Workspace and lets them open those transcripts
  - A Workspace-level Assisted Authoring Mode default (ON/OFF) in Settings, applied when a bot is created into or placed into the Workspace after that default is set, with later per-bot override
  - A larger create-Workspace dialog (not limited to the sidebar) that includes name, the four building-permission toggles, and optional invite
  - Short Owner / Facilitator / Participant explanations on invite role controls and Members role labels (hover or “?” only)
  - Denying or redirecting members who open a section they are not allowed to use
- **Out of scope**:
  - Renaming Owner to Admin, or adding or removing Workspace roles
  - Changing the default of building permission (b) or the other building-permission defaults for new Workspaces
  - Making membership alone reveal other members’ placed bots
  - Replacing or redesigning per-bot Activity, My sessions, or the learner sharing toggle on published chat
  - AI analysis of conversations, session deletion, retention policies, or usage analytics dashboards
  - Changing student Publish, Community, or peer inspect/duplicate of placed bots
  - Showing the existing membership/placement event feed as the new Activity tab
  - Organization hierarchy, Collections, or cross-Workspace insights (`workspace-collections`)
- **Adjacent expectations**:
  - `educator-workspaces` remains the source of roles, building permissions (a)–(d), invite accept (email pending + invite link), placement, and Owner-only delete / ownership transfer. Facilitators still cannot delete a Workspace or change or remove the Owner.
  - `bot-activity-sessions` remains the source of session recording, per-bot Activity for the bot owner, My sessions, and the learner owner-sharing toggle. This feature extends who may review **shared** transcripts of bots placed in a Workspace: that Workspace’s Owner and Facilitators, in Workspace Activity only. Unshared sessions stay hidden there. Published-chat notice copy is unchanged.
  - `assisted-authoring-mode` remains the source of ON/OFF editor behavior and the per-bot Settings toggle. Assisted Authoring Mode stays a single value per bot (not a per-Workspace copy). A Workspace default, when applied, updates that bot’s mode. Bots created outside a Workspace still default to OFF unless this feature applies a Workspace default.
  - Invite join, sign-in accept of pending email invites, and “invite no longer valid” remain as they are today.

## Requirements

### Requirement 1: Role-based hub tabs

**Objective:** As a Workspace member, I want to see only the hub sections I can use, so that I am not offered Settings, Members, or Activity I cannot act on.

#### Acceptance Criteria

1. While a user is a Participant in a Workspace, the Teacher Prompting System shall show that Workspace’s Bots section and shall not show Settings, Members, Invites, or Activity as hub tabs.
2. While a user is an Owner or a Facilitator in a Workspace, the Teacher Prompting System shall show Bots, Settings, Members, and Activity as hub tabs, and shall not show Invites as its own tab.
3. The Teacher Prompting System shall label the cross-bot session section “Activity” (not “Sessions”).
4. If a Participant opens Settings, Members, Invites, or Activity for a Workspace, the Teacher Prompting System shall not show that section’s content and shall present the Bots section instead.
5. If an Owner or Facilitator opens the former Invites section for a Workspace, the Teacher Prompting System shall present Members, including invite controls.
6. While a user is a Participant, the Teacher Prompting System shall still allow them to leave the Workspace without showing Settings, Members, or Activity content.
7. While a user is a Participant, the Teacher Prompting System shall not show the member roster or invite controls on the Workspace hub.

### Requirement 2: Invites on Members

**Objective:** As a Workspace Owner or Facilitator, I want to invite people from Members with a clear share link, so that one URL can bring in a cohort without a growing list of links.

#### Acceptance Criteria

1. When an Owner or Facilitator opens Members, the Teacher Prompting System shall let them invite by email and by invitation link from that section.
2. When an Owner or Facilitator invites by email or invitation link, the Teacher Prompting System shall offer Facilitator or Participant as the invite role and shall not grant Owner through an ordinary invite.
3. The Teacher Prompting System shall treat an invitation link as reusable: any signed-in educator who opens a valid link shall be able to join at the role of that link; the system shall not require a distinct URL per person for link invites.
4. When an Owner or Facilitator selects Facilitator or Participant for the invitation link, the Teacher Prompting System shall show the current URL for that role and a copy control in the same place (they shall not have to create a new link each time they want to copy).
5. When an Owner or Facilitator copies the invitation link, the Teacher Prompting System shall copy the URL currently shown for the selected role.
6. The Teacher Prompting System shall keep one current invitation link per invite role (Facilitator and Participant) for the Workspace and shall not add a new stacked link each time the operator copies or redisplays the URL.
7. The Teacher Prompting System shall not present an Active invites list of invitation links.
8. When an Owner or Facilitator records an email invite, the Teacher Prompting System shall show that invitee on Members as invited and not yet joined, and shall not use an Active invites link list for that purpose.
9. When an Owner or Facilitator resets the invitation link for a role, the Teacher Prompting System shall invalidate the previous URL for that role, show the replacement URL in the same invitation-link control, and reject new joins through the old URL.
10. When a signed-in educator accepts a valid email invite or invitation link, the Teacher Prompting System shall add them as a member at the role on that invite, using the existing accept behavior.
11. If an invitation link is reset, revoked, or expired, or an email invite is revoked or expired, the Teacher Prompting System shall reject new joins through that invite and inform the user that the invite is no longer valid.
12. While a user is a Participant, the Teacher Prompting System shall not allow them to create, copy as an operator, reset, or revoke Workspace invites.

### Requirement 3: Workspace Activity

**Objective:** As a Workspace Owner or Facilitator, I want one Activity view of shared chats for every bot placed in the Workspace, so that I can review use without opening each bot I own.

#### Acceptance Criteria

1. When an Owner or Facilitator opens Activity for a Workspace, the Teacher Prompting System shall list shared chat sessions for every bot currently placed in that Workspace, including bots they do not personally own, ordered by most recent activity.
2. When Activity lists a session, the Teacher Prompting System shall show at least the bot’s name, the participant’s display name or “Anonymous”, the session start time, and whether the session is an editor test or a public chat.
3. When an Owner or Facilitator selects a listed session, the Teacher Prompting System shall show that session’s full transcript as read-only.
4. If a session’s learner turned owner sharing off, the Teacher Prompting System shall not list that session in Workspace Activity and shall not show its transcript there.
5. If no shared sessions exist for the placed bots, the Teacher Prompting System shall show an empty Activity state that explains sessions appear after those bots are used with sharing on.
6. When a bot is no longer placed in the Workspace, the Teacher Prompting System shall stop listing that bot’s sessions in that Workspace’s Activity.
7. While a user is a Participant or is not a member of the Workspace, the Teacher Prompting System shall deny Workspace Activity for that Workspace.
8. The Teacher Prompting System shall not use Activity to show membership or placement event history as a substitute for chat sessions.
9. The Teacher Prompting System shall not provide session edit or delete in Workspace Activity.

### Requirement 4: Workspace Assisted Authoring default

**Objective:** As a Workspace Owner or Facilitator, I want a default Assisted Authoring Mode for the Workspace, so that bots added later start from a course-wide choice I can still change per bot.

#### Acceptance Criteria

1. When an Owner or Facilitator opens Settings, the Teacher Prompting System shall let them set the Workspace Assisted Authoring Mode default to ON or OFF.
2. When a new Workspace is created, the Teacher Prompting System shall set that default to OFF.
3. When a bot is created into a Workspace, the Teacher Prompting System shall set that bot’s Assisted Authoring Mode to the Workspace default in effect at that moment.
4. When a bot is placed into a Workspace, the Teacher Prompting System shall set that bot’s Assisted Authoring Mode to the Workspace default in effect at that moment.
5. When the Workspace default changes, the Teacher Prompting System shall not change Assisted Authoring Mode on bots that were already created into or placed in that Workspace.
6. When an educator who can edit a bot changes that bot’s Assisted Authoring Mode in bot Settings, the Teacher Prompting System shall persist the new mode for the bot and shall not block the change because of the Workspace default.
7. While a user is a Participant, the Teacher Prompting System shall not allow them to change the Workspace Assisted Authoring Mode default.
8. If saving the Workspace default fails, the Teacher Prompting System shall show an error and shall not present the new value as saved.

### Requirement 5: Workspace creation

**Objective:** As an educator creating a Workspace, I want to name it, set building permissions, and start inviting in a readable dialog, so that I do not have to discover those settings only after create.

#### Acceptance Criteria

1. When a signed-in educator chooses to create a Workspace, the Teacher Prompting System shall show a create dialog that is not limited to the sidebar and is large enough to present the create fields without clipping them to the sidebar.
2. When the create dialog is shown, the Teacher Prompting System shall require a Workspace name and shall show the four building-permission controls: (a) create bots into this Workspace, (b) see each other’s placed bots, (c) share outside this Workspace, (d) manage own placed bots.
3. When the create dialog is shown, the Teacher Prompting System shall start those four permissions in the existing new-Workspace default state (all off) and shall let the creator change them before create completes.
4. When the create dialog is shown, the Teacher Prompting System shall let the creator start inviting as an optional step using the same email and reusable invitation-link pattern as Members (role, shown URL, copy; no Active invites link list), and shall not require an invite to finish creating the Workspace.
5. When create succeeds, the Teacher Prompting System shall make the creator the Owner, apply the name and building permissions they set, honor any invites they started, and take them to the new Workspace.
6. After the Workspace exists, the Teacher Prompting System shall still let Owners and Facilitators change building permissions in Settings and invite from Members.
7. If create fails, the Teacher Prompting System shall show an error and shall not treat the Workspace as created.
8. The Teacher Prompting System shall not require the creator to set the Assisted Authoring Mode default in the create dialog (that default remains available in Settings after create).

### Requirement 6: Role explanations

**Objective:** As an educator inviting or reviewing members, I want a short explanation of each role without extra body copy, so that I can choose Facilitator vs Participant without leaving the flow.

#### Acceptance Criteria

1. When an Owner or Facilitator chooses an invite role, the Teacher Prompting System shall provide a short explanation of Owner, Facilitator, and Participant through hover or a “?” control, and shall not add long explanatory paragraphs to that surface.
2. When Members shows a member’s role, the Teacher Prompting System shall provide the same short role explanations through hover or a “?” control on the role name, and shall not add long explanatory paragraphs to the roster.
3. The Teacher Prompting System shall keep the display names Owner, Facilitator, and Participant (it shall not rename Owner to Admin).
4. The short explanations shall state that the Owner administers the Workspace and can delete it and transfer ownership; that a Facilitator can do the same day-to-day administration except delete the Workspace or change or remove the Owner; and that a Participant uses the Workspace according to building permissions and cannot change Settings, manage members, or view Activity.

### Requirement 7: Unchanged visibility default

**Objective:** As a course operator, I want peer bot visibility to stay conservative until I turn it on, so that joining a Workspace does not unexpectedly expose placed bots to Participants.

#### Acceptance Criteria

1. When a new Workspace is created, the Teacher Prompting System shall leave building permission (b) off unless the creator turns it on in the create dialog or later in Settings.
2. While permission (b) is off, the Teacher Prompting System shall show a Participant only the placed bots they own in that Workspace, and shall still let Owners and Facilitators see all placed bots.
3. While permission (b) is on, the Teacher Prompting System shall let Participants browse other members’ bots placed in that Workspace.
4. The Teacher Prompting System shall not treat Workspace membership alone as permission to see other members’ placed bots.
