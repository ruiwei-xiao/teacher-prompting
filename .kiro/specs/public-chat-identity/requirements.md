# Requirements Document

## Introduction

Teacher Prompting lets educators publish AI tutoring bots and review how those bots are used. Public chat already records whether a visitor is signed in or anonymous, but every anonymous visitor is stored as a single unlabeled identity. Researchers therefore cannot tell how many distinct anonymous people used a bot, or whether the same browser returned. The product should encourage login for research-quality data while still allowing anonymous use.

This specification adds an identity choice on published public chat: unauthenticated visitors must choose login or anonymous continuation before chatting. Anonymous continuation uses a remembered per-browser visitor identity so anonymous people can be distinguished from one another. If that visitor later signs in on the same browser, prior chats from that identity become that user's chats in My sessions and in activity views.

Primary users are public-chat visitors (often students) and the educators/researchers who read activity. Editor test chats are unchanged.

## Boundary Context

- **In scope**:
  - An identity-choice modal on published public chat for unauthenticated visitors
  - Using the existing sign-in flow from that modal and returning to the same chat
  - A persistent anonymous visitor identity remembered on that browser and attached to recorded public-chat sessions
  - A way to sign in after choosing anonymous, including during an in-progress chat
  - Associating an anonymous visitor identity with a user account at later sign-in
  - Showing previously anonymous chats as that user's chats in My sessions, bot activity, workspace activity, and activity downloads
- **Out of scope**:
  - Forcing login or removing anonymous public chat
  - Identity gates on editor test chats or on educator surfaces other than published public chat
  - Cross-device anonymous identity (an anonymous identity lives on one browser)
  - New analytics dashboards, unique-visitor charts, or aggregated metrics
  - Changing owner-sharing, recording-notice, opt-out, or session-deletion rules except where identity attribution changes who a recorded session belongs to
  - New sign-in providers or changes to account creation
- **Adjacent expectations**:
  - `bot-activity-sessions` continues to own session recording, sharing, activity lists, My sessions, transcripts, and downloads. This feature extends who a public-chat participant is; it does not replace those views.
  - Existing sign-in methods remain the way visitors authenticate. This feature adds entry points from published public chat and a return to that chat after success.
  - Unattributed anonymous sessions still do not appear in My sessions. After attribution they do, which extends the earlier "anonymous sessions are never in My sessions" rule for those linked sessions only.
  - Unattributed anonymous participants remain labeled "Anonymous" in lists and transcripts. After attribution they use the signed-in display name, like other signed-in sessions.

## Requirements

### Requirement 1: Identity-choice gate on public chat

**Objective:** As a researcher and as a public-chat visitor, I want unauthenticated visitors to choose login or anonymous use before chatting, so that login is encouraged without blocking people who decline an account.

#### Acceptance Criteria

1. When an unauthenticated visitor opens a published bot's public chat page, the Teacher Prompting System shall present an identity-choice modal before the visitor can participate in the chat.
2. When a signed-in visitor opens a published bot's public chat page, the Teacher Prompting System shall not present the identity-choice modal.
3. When an unauthenticated visitor opens or reloads a published bot's public chat page, the Teacher Prompting System shall present the identity-choice modal even if that visitor previously chose to continue anonymously on that browser.
4. The identity-choice modal shall use concise English copy, a light surface consistent with public chat, a visually primary Log in action, and a secondary outlined Continue anonymously action.
5. While the identity-choice modal is displayed, the Teacher Prompting System shall not accept chat participation from that visitor, including sending messages.
6. If the visitor closes or otherwise leaves the identity-choice modal without choosing login or anonymous continuation, then the Teacher Prompting System shall keep chat participation unavailable until the visitor makes a choice.

### Requirement 2: Sign-in from the identity-choice modal

**Objective:** As an unauthenticated visitor, I want choosing login to use the existing sign-in flow and bring me back to the same published chat, so that I can continue without finding the link again.

#### Acceptance Criteria

1. When the visitor chooses to log in from the identity-choice modal, the Teacher Prompting System shall start the existing sign-in flow.
2. When sign-in succeeds from that flow, the Teacher Prompting System shall return the visitor to the same published chat page as a signed-in user.
3. When the visitor returns to that published chat page after successful sign-in, the Teacher Prompting System shall not present the identity-choice modal and shall allow chatting.
4. If the visitor cancels or fails sign-in and returns to the published chat page still unauthenticated, then the Teacher Prompting System shall present the identity-choice modal again and shall keep chat participation unavailable until the visitor makes a choice.

### Requirement 3: Anonymous continuation and remembered visitor identity

**Objective:** As a visitor who does not want an account, I want to continue anonymously, and as a researcher I want those anonymous visits to be distinguishable per browser, so that repeat anonymous use can be told apart from many different people.

#### Acceptance Criteria

1. When the visitor chooses to continue anonymously, the Teacher Prompting System shall allow chatting on that public chat page without requiring an account.
2. When the visitor chooses to continue anonymously and that browser does not already have a remembered anonymous visitor identity, the Teacher Prompting System shall create a new anonymous visitor identity for that browser.
3. When the visitor chooses to continue anonymously and that browser already has a remembered anonymous visitor identity, the Teacher Prompting System shall reuse that same identity.
4. When the Teacher Prompting System records a public-chat session for an unauthenticated visitor, it shall associate that session with the visitor's anonymous visitor identity without collecting the visitor's name, email, or other account profile information.
5. When unauthenticated visitors use different browsers, the Teacher Prompting System shall treat them as distinct anonymous visitor identities.
6. If the browser no longer remembers the anonymous visitor identity, then the Teacher Prompting System shall treat the next anonymous continuation as a new anonymous visitor identity.

### Requirement 4: Sign-in after choosing anonymous

**Objective:** As a visitor who started anonymously, I want to sign in later from the same public chat, so that I can identify myself without abandoning the conversation.

#### Acceptance Criteria

1. While an unauthenticated visitor is on a published chat page after choosing to continue anonymously, the Teacher Prompting System shall show that they are anonymous and provide a clearly visible Log in button.
2. When the visitor signs in from that page, the Teacher Prompting System shall return them to the same published chat page as a signed-in user.
3. When the visitor signs in while an anonymous conversation is in progress on that page, the Teacher Prompting System shall keep that conversation available as one continuous conversation attributed to the signed-in user.

### Requirement 5: Attribution of anonymous history after sign-in

**Objective:** As a visitor who later signs in, I want chats I already had anonymously on that browser to become my chats, so that my history and the educator's activity view match the same person.

#### Acceptance Criteria

1. When a user signs in on a browser that has an anonymous visitor identity, the Teacher Prompting System shall record that the anonymous visitor identity is associated with that signed-in user.
2. When that association is recorded, the Teacher Prompting System shall treat public-chat sessions that are still associated only with that anonymous visitor identity as that signed-in user's sessions.
3. When those previously anonymous sessions become associated with the signed-in user, the Teacher Prompting System shall include them in that user's My sessions.
4. When those previously anonymous sessions become associated with the signed-in user, the Teacher Prompting System shall display them in bot activity and workspace activity using that user's display name rather than "Anonymous".
5. If a public-chat session is already associated with a different user account, then the Teacher Prompting System shall leave that session associated with the earlier user when another person later signs in on the same browser.
6. The Teacher Prompting System shall not attach anonymous-only sessions from one browser to a user who signs in on a different browser that does not have that anonymous visitor identity.

### Requirement 6: Identity in lists, transcripts, and downloads

**Objective:** As an educator or researcher reviewing activity, I want unattributed anonymous visitors to stay labeled Anonymous while still being distinguishable in downloads, and I want attributed chats to look like ordinary signed-in chats.

#### Acceptance Criteria

1. While a public-chat session remains unattributed to a user account, the Teacher Prompting System shall display the participant as "Anonymous" in session lists and transcripts.
2. The Teacher Prompting System shall not show unattributed anonymous sessions in My sessions.
3. When an owner or other authorized researcher downloads shared activity, the Teacher Prompting System shall include a stable identifier that distinguishes distinct unattributed anonymous visitors from one another.
4. When a session has been attributed to a signed-in user, activity downloads shall identify that session with that user's account identity and display name, consistent with other signed-in sessions.

### Requirement 7: Privacy disclosure for later linking

**Objective:** As a public-chat visitor, I want to know that anonymous use is still remembered on this browser and may be linked if I later sign in, so that I am not surprised when prior chats appear under my account.

#### Acceptance Criteria

1. When the identity-choice modal is shown, the Teacher Prompting System shall inform the visitor in English that continuing anonymously still records a remembered visitor identity on that browser.
2. When the identity-choice modal is shown, the Teacher Prompting System shall inform the visitor in English that signing in later associates prior chats from that visitor identity with their account.

### Requirement 8: Visible public-chat account status

**Objective:** As a public-chat visitor, I want to see whether I am anonymous or signed in and access the relevant account actions, so that my current identity is always clear.

#### Acceptance Criteria

1. After an unauthenticated visitor chooses anonymous continuation, the Teacher Prompting System shall show an Anonymous status and a visually clear Log in button in the public-chat header.
2. When a signed-in visitor uses public chat, the Teacher Prompting System shall show the current account's display name or email in the public-chat header.
3. The signed-in account control shall provide access to My sessions and Log out.
4. When the visitor logs out from public chat, the Teacher Prompting System shall return to the same public-chat URL as an unauthenticated visitor, show the identity-choice modal, and keep chat participation unavailable until a new choice is made.
