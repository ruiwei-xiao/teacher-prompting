# Requirements Document

## Introduction

Teacher Prompting helps educators author, evaluate, and publish AI tutoring bots. Today, personal bots appear in a flat **My bots** list, and the Library sidebar shows non-functional **Starred** and **Recently Used** placeholders. This specification adds a Playlab-aligned personal **Starred** library so signed-in educators can pin bots they can currently access—both bots they own and bots they can see through Workspace membership—for quick access across sessions and devices.

Primary users are teachers and other educator-builders. Student end-users of published tutoring chats are out of scope. **Recently Used** is removed (not implemented) to match current Playlab navigation. Starring bots that are only discoverable via Community (and not otherwise accessible) is deferred.

## Boundary Context

- **In scope**:
  - Star and unstar bots the signed-in educator owns
  - Star and unstar bots the educator can currently see via Workspace placement (including bots owned by other members), using the same visibility rules as the Workspace bot list
  - A dedicated Starred library view listing eligible starred bots, ordered by most recently starred
  - Opening a starred bot through the appropriate existing experience (editor for owned bots; non-edit peer inspect for accessible non-owned Workspace bots)
  - Enabling Library navigation to Starred with clear current-location indication
  - Removing the non-functional Recently Used entry from Library navigation
  - Account-scoped star preferences that remain available when the same educator signs in again (including on another device)
  - Graceful handling when a previously starred bot is deleted or is no longer accessible to the educator
- **Out of scope**:
  - Recently Used / automatic recents history
  - Starring Community gallery bots solely because they appear in Community (without ownership or Workspace visibility)
  - Changing personal bot ownership, Publish, project share, or Community gallery behavior
  - Defining or changing Workspace membership, placements, or building permissions (this feature consumes existing visibility rules)
  - Co-editing or shared edit rights on another educator’s bot
  - Collections or Organization features
- **Adjacent expectations**:
  - Existing My bots create / open / share / delete flows continue to work; starring is an additional personal preference, not a change to bot ownership
  - `educator-workspaces` owns Workspace navigation, placements, peer visibility (including building permission (b)), and peer non-edit inspect / duplicate; this feature adds star controls and Starred navigation on top of those rules
  - Authentication and individual accounts already exist; stars are preferences of the signed-in educator

## Requirements

### Requirement 1: Star eligibility and toggle

**Objective:** As an educator, I want to star bots I can access—including peers’ bots I see in a Workspace—so that my personal shortcuts match Playlab-style pinning.

#### Acceptance Criteria

1. When a signed-in educator stars a bot they own from a surface that shows that bot, the Teacher Prompting System shall record that bot as starred for that educator.
2. When a signed-in educator stars a bot they do not own but can currently see through Workspace membership (under existing Workspace visibility rules), the Teacher Prompting System shall record that bot as starred for that educator without changing ownership.
3. When a signed-in educator unstars a bot they previously starred, the Teacher Prompting System shall stop listing that bot as starred for that educator.
4. While a bot is starred for the educator, the Teacher Prompting System shall show a clear starred indication on that bot’s card or equivalent control on surfaces that offer starring.
5. While a bot is not starred for the educator, the Teacher Prompting System shall show a clear not-starred indication on that bot’s card or equivalent control on surfaces that offer starring.
6. If a signed-in educator attempts to star a bot they cannot currently access (not owned and not visible via any Workspace under existing rules), the Teacher Prompting System shall deny the action and shall not add that bot to their Starred library.
7. The Teacher Prompting System shall not treat starring or unstarring as a change to bot ownership, Publish state, or Workspace placement.

### Requirement 2: Starred library view

**Objective:** As an educator, I want a dedicated Starred list of my pinned bots, so that I can open them without scanning My bots or every Workspace.

#### Acceptance Criteria

1. When a signed-in educator opens the Starred library, the Teacher Prompting System shall show the bots they currently have starred that remain eligible under Requirement 6.
2. When the educator has one or more eligible starred bots, the Teacher Prompting System shall order that list by most recently starred first.
3. When the educator has no eligible starred bots, the Teacher Prompting System shall show an empty state that explains Starred is empty and that bots can be starred from My bots or from a Workspace bot list.
4. When the educator opens a starred bot they own from the Starred library for editing, the Teacher Prompting System shall open that bot’s existing editor experience.
5. When the educator opens a starred bot they do not own from the Starred library, the Teacher Prompting System shall open an existing non-edit peer experience consistent with Workspace peer inspect (and shall not grant edit access solely because the bot is starred).
6. If loading the Starred library fails, the Teacher Prompting System shall show an error state and shall not present a silently empty list as if the educator had no stars.

### Requirement 3: Library navigation

**Objective:** As an educator, I want Starred in the Library sidebar like Playlab, so that I can reach my pinned bots from primary navigation.

#### Acceptance Criteria

1. When a signed-in educator uses Library navigation, the Teacher Prompting System shall provide a working Starred destination (not a disabled “Coming soon” control).
2. When the educator is on the Starred library, the Teacher Prompting System shall visually indicate that Starred is the current location in Library navigation.
3. The Teacher Prompting System shall not show a Recently Used Library navigation item for this feature.
4. When the educator navigates to My bots from Library navigation, the Teacher Prompting System shall continue to show the personal My bots experience distinctly from Starred.

### Requirement 4: Account-scoped persistence

**Objective:** As an educator, I want my stars to stay with my account, so that I see the same Starred list when I sign in again or on another device.

#### Acceptance Criteria

1. When an educator stars a bot and later signs in again with the same account, the Teacher Prompting System shall still treat that bot as starred for them until they unstar it or the bot is no longer eligible.
2. When an educator stars a bot on one device and then signs in with the same account on another device, the Teacher Prompting System shall show that bot in their Starred library on the second device after stars have been loaded (if still eligible).
3. The Teacher Prompting System shall keep each educator’s starred set private to that educator’s account (other educators shall not see or inherit another educator’s stars).
4. The Teacher Prompting System shall not rely on a single browser’s local-only storage as the sole source of truth for stars.

### Requirement 5: Authentication and access

**Objective:** As the product, I want Starred to require a signed-in educator, so that personal pin lists are not exposed anonymously.

#### Acceptance Criteria

1. If an unauthenticated user attempts to open the Starred library, the Teacher Prompting System shall require sign-in before showing that educator’s stars.
2. If an unauthenticated user attempts to star or unstar a bot, the Teacher Prompting System shall reject the action.
3. While an educator is signed in, the Teacher Prompting System shall only include bots in their Starred library that remain eligible for that educator under Requirement 6.

### Requirement 6: Deleted or inaccessible starred bots

**Objective:** As an educator, I want Starred to stay accurate when a bot is deleted or I can no longer access it, so that I do not see broken shortcuts.

#### Acceptance Criteria

1. If a bot that was starred is deleted, the Teacher Prompting System shall not show that bot as an openable entry in the Starred library.
2. If a bot that was starred is no longer owned by the educator and is no longer visible to them through any Workspace under existing visibility rules, the Teacher Prompting System shall not show that bot as an openable entry in that educator’s Starred library.
3. If the educator loses the Workspace visibility that made a non-owned starred bot accessible (for example membership ends, the bot is removed from Workspaces they can see, or peer visibility rules no longer allow them to see it), the Teacher Prompting System shall not show that bot as an openable Starred entry.
4. When the Starred library is shown after such a bot becomes ineligible, the Teacher Prompting System shall present only remaining eligible starred bots (or the empty state if none remain).

### Requirement 7: Star controls on My bots and Workspace lists

**Objective:** As an educator, I want to star from the lists where I already browse bots, so that pinning fits existing My bots and Workspace workflows.

#### Acceptance Criteria

1. When a bot appears in My bots, the Teacher Prompting System shall allow the educator to star or unstar it without leaving the My bots list, using a control on that bot’s card or an equivalent nearby control.
2. When a bot appears in a Workspace bot list that the educator is allowed to see, the Teacher Prompting System shall allow the educator to star or unstar that bot from that list, including bots owned by other members.
3. When a starred bot the educator owns is deleted through the existing delete flow, the Teacher Prompting System shall remove it from My bots and shall no longer show it as an openable Starred entry (consistent with Requirement 6).
4. When the same bot appears on more than one surface (My bots, a Workspace list, and/or Starred), the Teacher Prompting System shall treat star state as the same personal preference across those surfaces after refresh or successful star/unstar.
