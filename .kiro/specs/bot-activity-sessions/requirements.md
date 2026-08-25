# Requirements Document

## Introduction

This feature introduces chat session recording and viewing to the platform, equivalent in spirit to Playlab's "activity". Today, conversations with bots are not persisted anywhere, so bot creators cannot see how their bots are used, and users cannot review their own chat history. This spec adds: (1) persistence of bot conversations as sessions, (2) a creator-facing activity view for each bot, (3) a "My sessions" history view for each user, (4) privacy handling for anonymous learners, and (5) supporting navigation and dashboard-card cleanups so the new entry points remain intuitive.

## Boundary Context

- **In scope**: Recording conversations from the public chat page and from editor test chats; creator-facing per-bot activity viewing; user-facing "My sessions" history; anonymous session handling and a recording notice; a participant-controlled toggle to stop sharing a conversation with the bot's owner (default on); renaming the existing "Activities" navigation item; cleaning up My bots card actions (labels, icons, activity entry point).
- **Out of scope**: AI-powered conversation analysis against goals/success paths (Playlab's "analyze conversation"); session deletion by any role (view-only in this release); data retention/expiry policies; aggregated usage analytics or metrics dashboards; exporting transcripts; changes to the rubric calibration feature beyond its navigation label.
- **Adjacent expectations**: The existing rubric calibration feature keeps its current behavior and routes; only its navigation label changes. Authentication continues to provide signed-in user identity; this feature does not add new sign-in flows. Publishing and sharing flows are unchanged; recording applies to existing chat surfaces.

## Requirements

### Requirement 1: Chat Session Recording

**Objective:** As a platform user, I want my conversations with bots to be recorded as sessions, so that they can be reviewed later by me and by the bot's creator.

#### Acceptance Criteria

1. When a user sends the first message of a conversation on a published bot's public chat page, the system shall create a new chat session associated with that bot.
2. When a creator sends the first message of a test conversation inside the bot editor, the system shall create a new chat session associated with that bot and marked as an editor test session.
3. When a message is exchanged in a recorded conversation, the system shall persist the message with its content, sender role (user or bot), and timestamp, in conversation order.
4. The system shall record for each session: the bot, the session start time, the most recent activity time, the source surface (public chat or editor test), and the participant (a signed-in user account or anonymous).
5. When a signed-in user starts a conversation, the system shall associate the session with that user's account.
6. When a non-signed-in user starts a conversation on a public chat page, the system shall record the session as anonymous without collecting personally identifying information.
7. The system shall record one continuous conversation as a single session, and shall create a new session when the user starts a new conversation.
8. If persisting a session or message fails, the system shall let the chat conversation continue uninterrupted without surfacing a blocking error to the chat participant.
9. While an anonymous participant has owner sharing turned off for a conversation, the system shall not record that conversation at all, and shall discard any portion of it recorded before sharing was turned off.

### Requirement 2: Creator-Facing Bot Activity View

**Objective:** As a bot creator, I want to see the chat logs of my bot from one place in the editor, so that I can understand how my bot is being used and improve it.

#### Acceptance Criteria

1. The bot editor shall provide an activity view (tab or section) for the bot being edited.
2. When the bot owner opens the activity view, the system shall display the bot's sessions ordered by most recent activity, excluding sessions whose participant turned owner sharing off.
3. The activity view shall show, for each session: the participant's display name or "Anonymous", the session start time, and a visual indicator distinguishing editor test sessions from public chat sessions.
4. When the bot owner selects a session in the activity view, the system shall display the full transcript of that session as read-only.
5. When the bot owner uses the activity action on a My bots card, the system shall navigate directly to that bot's activity view.
6. If a bot has no recorded sessions, the activity view shall display an empty state explaining that sessions will appear once the bot is used.
7. If a user who does not own the bot attempts to access the bot's activity view, the system shall deny access.
8. While the session list grows large, the activity view shall remain browsable by loading sessions incrementally or in pages rather than all transcripts at once.

### Requirement 3: My Sessions History

**Objective:** As a user, I want to review my own chat history with any bot (mine or someone else's), so that I can revisit past conversations.

#### Acceptance Criteria

1. While a user is signed in, the sidebar shall display a "My sessions" navigation item.
2. When a signed-in user opens My sessions, the system shall display that user's own sessions across all bots, ordered by most recent activity.
3. The My sessions list shall show, for each session: the bot's name, the session start time, and a visual indicator distinguishing editor test sessions from public chat sessions.
4. When the user selects a session in My sessions, the system shall display the full transcript of that session as read-only.
5. The system shall include in My sessions the user's sessions with their own bots, with other users' bots, and their editor test sessions.
6. If the bot associated with a session has been deleted, the session shall remain listed and viewable with an indication that the bot is no longer available.
7. The system shall not display anonymous sessions in My sessions, since they are not associated with any user account.
8. If a signed-out visitor attempts to open My sessions, the system shall require sign-in.

### Requirement 4: Privacy and Access Control

**Objective:** As a learner chatting with a published bot, I want to know that my conversation may be visible to the bot's creator, so that I am not surprised by how my data is used.

#### Acceptance Criteria

1. While a public chat page is displayed, the system shall show an unobtrusive persistent notice informing the participant that the conversation may be viewed by the bot's creator.
2. The system shall display anonymous participants as "Anonymous" (or equivalent neutral label) in all session lists and transcripts.
3. The system shall allow a session transcript to be viewed only by the bot's owner and, for sessions associated with an account, the session's participant.
4. The system shall present all session lists and transcripts as read-only, with no edit or delete capability in this release.
5. While a public chat page is displayed, the system shall provide a sharing toggle near the recording notice that lets the participant turn owner sharing off for the current conversation, with sharing on by default.
6. If the participant turns owner sharing off, the system shall exclude the entire session (including messages exchanged before the toggle was changed) from the bot owner's activity view. The participant shall be able to turn owner sharing back on for the same conversation; when sharing is on again, the owner can see the session.
7. While owner sharing is off for a signed-in participant's session, the system shall continue to record the session and display it in that participant's My sessions with an indication that it is not shared with the owner.
8. When a participant changes the sharing toggle, the system shall reflect the current sharing state visibly on the chat page.

### Requirement 5: Navigation Naming

**Objective:** As a user navigating the sidebar, I want clearly distinguishable navigation labels, so that I do not confuse collaborative activities with chat session history.

#### Acceptance Criteria

1. The sidebar shall label the existing rubric calibration navigation item "Collaborative activities" instead of "Activities".
2. When a user opens the renamed "Collaborative activities" item, the system shall present the existing rubric calibration feature with unchanged behavior, using the page title "Collaborative activities".
3. The sidebar shall present "My sessions" and "Collaborative activities" as distinct items with labels that do not overlap in meaning.

### Requirement 6: My Bots Card Actions

**Objective:** As a bot creator using the My bots dashboard, I want clearly labeled card actions including an activity entry point, so that I can immediately understand what each action does.

#### Acceptance Criteria

1. The My bots card shall label the action that opens the bot editor "Edit" instead of "Open bot".
2. The My bots card shall provide an action that opens the bot's activity view.
3. The My bots card shall retain the existing Share and Delete capabilities, with Delete continuing to require confirmation before removal.
4. The My bots card shall present the Delete action as an icon-based control that is visually distinct from non-destructive actions.
5. Where card actions are presented as icons, the system shall provide an accessible text label (such as a tooltip or screen-reader label) for each icon action.
