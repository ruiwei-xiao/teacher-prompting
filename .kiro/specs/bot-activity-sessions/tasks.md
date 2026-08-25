# Implementation Plan

- [ ] 1. Foundation: chat session data layer
- [x] 1.1 Create the chat session domain types and store scaffolding with the recorded-turn write path
  - Define session and message domain types (surface, participant, sharing flag, snapshot fields, image-omitted marker)
  - Set up the environment-switched persistence backends (Postgres table with indexes created lazily; local JSON-file fallback) following the existing store façade convention
  - Implement the idempotent recorded-turn upsert: create on first turn, replace transcript on later turns, reject writes whose bot or participant identity does not match the existing session
  - Enforce sharing monotonicity in the write path: a recorded turn may create a session with sharing off or keep it off, but must never flip an unshared session back to shared
  - Observable completion: calling the upsert twice for the same session yields one session whose transcript equals the latest submitted history, in both backends
  - _Requirements: 1.3, 1.4, 1.7, 4.6_

- [x] 1.2 Implement session query and sharing mutation functions
  - Owner-dimension list scoped to one bot, newest activity first, excluding unshared sessions, with limit/offset paging and a has-more signal
  - Participant-dimension list across bots, newest first, never returning anonymous sessions
  - Single-session lookup returning the full transcript; summaries expose message count and whether the bot still exists (for deleted-bot labeling)
  - Sharing-off mutation (true-to-false only) and session discard (row deletion) for anonymous opt-out
  - Create the navigation constants module (My sessions path and per-bot activity path helper) that later UI tasks consume
  - Observable completion: unshared sessions disappear from the owner-dimension list but remain in the participant-dimension list, in both backends
  - _Requirements: 2.2, 2.8, 3.2, 3.5, 3.6, 3.7, 4.6_

- [ ] 2. Recording integration across chat surfaces
- [x] 2.1 Add the opt-in recording step to the chat API route
  - Accept an optional recording payload (session id, surface, owner-sharing flag, message timestamps) without changing behavior for requests that omit it (builder-assistant conversations stay unrecorded)
  - Validate surface claims against the existing published/editor auth branch; on mismatch skip recording, never fail the chat
  - Determine participant identity from the authenticated session (or anonymous with no personally identifying data); strip image data URLs and mark them as omitted; skip persistence entirely for anonymous turns with sharing off
  - The recording payload can never re-enable sharing on a session that has been unshared
  - Persist after a successful model reply inside a failure-swallowing guard so chat replies are never blocked by recording errors
  - Observable completion: a public-chat turn with a recording payload creates a session row; the same request without the payload changes nothing; a forced store failure still returns a normal reply
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9_

- [x] 2.2 (P) Wire the public chat page into recording
  - Generate a session identifier when a conversation starts and reuse it for every turn; a page reload starts a new conversation with a new identifier
  - Attach the recording payload (public surface, current sharing state, per-message timestamps) to each chat request and strip image data before sending the recording view of history
  - Observable completion: chatting on a published bot page produces one session whose transcript matches the on-screen conversation, as signed-in and as anonymous
  - _Requirements: 1.1, 1.5, 1.6, 1.7_
  - _Boundary: PublishedChatbot_
  - _Depends: 2.1_

- [x] 2.3 (P) Wire the editor test chat into recording
  - Attach the recording payload with the editor-test surface at both chat call sites (test-case rail and try-chat)
  - Maintain one session identifier per test-case conversation; switching or resetting a case starts a new session
  - Builder-assistant (left panel) conversations remain untouched and unrecorded
  - Observable completion: running a test case creates a session marked as an editor test attributed to the creator; the builder-assistant chat creates no session
  - _Requirements: 1.2, 1.7_
  - _Boundary: AssistantPanel_
  - _Depends: 2.1_

- [ ] 3. Session read and control APIs
- [x] 3.1 (P) Owner-scoped session list endpoint for a bot
  - Authenticate, verify bot ownership, return paginated shared-only session summaries ordered by recency
  - Observable completion: the owner receives their bot's shared sessions with a has-more flag; a non-owner receives an error status
  - _Requirements: 2.2, 2.7, 2.8_
  - _Boundary: OwnerSessionsAPI_
  - _Depends: 1.2_

- [x] 3.2 (P) Participant-scoped session list endpoint
  - Authenticate and return the caller's own session summaries across all bots, newest first, paginated
  - Observable completion: a signed-in user receives only their own sessions including unshared and editor-test ones; signed-out callers receive an unauthorized status
  - _Requirements: 3.2, 3.5, 3.7_
  - _Boundary: MySessionsAPI_
  - _Depends: 1.2_

- [x] 3.3 (P) Single-session transcript endpoint with owner-or-participant authorization
  - Allow the session participant always; allow the bot owner only while the session is shared; reject everyone else
  - Observable completion: an unshared session's transcript is retrievable by its participant but returns a forbidden/not-found status to the bot owner
  - _Requirements: 2.4, 3.4, 4.3_
  - _Boundary: TranscriptAPI_
  - _Depends: 1.2_

- [ ] 3.4 (P) Sharing opt-out endpoint
  - Signed-in participant turns sharing off for their own session (flag flip); anonymous requests on anonymous sessions discard the session entirely; the endpoint accepts only the off transition
  - Observable completion: after opt-out, a signed-in session is flagged unshared and an anonymous session no longer exists
  - _Requirements: 1.9, 4.6_
  - _Boundary: SharingEndpoint_
  - _Depends: 1.2_

- [ ] 4. Participant privacy controls on the public chat page
  - Show a persistent, unobtrusive notice that the creator may view the conversation, with the sharing toggle beside it (on by default)
  - Turning the toggle off calls the opt-out endpoint, keeps the toggle off for the rest of the conversation, and updates recording payloads so anonymous turns stop being persisted
  - Sharing state remains visible on the page; on endpoint failure the toggle reverts to on with a brief error
  - Observable completion: opting out mid-conversation removes the session from the owner's view (entire session) while chat continues to work
  - _Requirements: 4.1, 4.5, 4.6, 4.8_
  - _Depends: 3.4_

- [ ] 5. Viewing surfaces
- [ ] 5.1 Build the shared session list and read-only transcript components
  - Paginated list with load-more, surface badges (public chat vs editor test), participant-or-bot name mode, "Anonymous" labeling, "not shared with owner" badge, deleted-bot indication, and a configurable empty state
  - Read-only transcript rendering with existing chat message rendering, image-omitted placeholders, and no edit/delete affordances
  - Client fetch helpers for the session APIs
  - Observable completion: components render list states (loading, empty, load-more) and a read-only transcript from API data
  - _Requirements: 2.3, 2.6, 2.8, 3.3, 3.6, 4.2, 4.4, 4.7_

- [ ] 5.2 (P) Create the bot activity page for creators
  - Server-gated route for one bot: unauthenticated or non-owner visitors get not-found; owners get a master-detail view (session list plus transcript) with an explanatory empty state
  - Observable completion: the owner browses their bot's sessions and opens transcripts at a stable URL; a non-owner cannot access the page
  - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_
  - _Boundary: ActivityPage, BotActivityView_
  - _Depends: 3.1, 3.3, 5.1_

- [ ] 5.3 (P) Create the My sessions page
  - Server-gated route requiring sign-in (redirect to sign-in when signed out); master-detail view across all of the user's sessions with bot names, surface badges, and deleted-bot labeling
  - Observable completion: a signed-in user opens past transcripts including editor tests and unshared sessions; a signed-out visitor is redirected to sign-in
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_
  - _Boundary: MySessionsPage, MySessionsView_
  - _Depends: 3.2, 3.3, 5.1_

- [ ] 6. Navigation and dashboard entry points
- [ ] 6.1 (P) Update sidebar navigation
  - Rename the rubric calibration item to "Collaborative activities" without touching its routes or behavior; add a "My sessions" item using the navigation constants module
  - Observable completion: the sidebar shows distinct "My sessions" and "Collaborative activities" items; the calibration pages behave exactly as before
  - _Requirements: 3.1, 5.1, 5.2, 5.3_
  - _Boundary: WorkspaceSidebar_
  - _Depends: 5.3_

- [ ] 6.2 (P) Add the activity entry point to the editor chrome
  - Add an "Activity" navigation control in the editor header linking to the bot's activity page
  - Observable completion: from the editor, one click opens the edited bot's activity view
  - _Requirements: 2.1_
  - _Boundary: EditorChrome_
  - _Depends: 5.2_

- [ ] 6.3 (P) Clean up My bots card actions
  - Relabel the editor-opening action to "Edit"; add an "Activity" action linking to the bot's activity page; keep Share; convert Delete to a visually distinct destructive icon control that still opens the existing confirmation dialog; give every icon action an accessible label and tooltip
  - Observable completion: a My bots card shows Edit, Activity, Share, and an icon Delete with tooltip; deleting still requires typed confirmation
  - _Requirements: 2.5, 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Boundary: AppCard, AppGrid_
  - _Depends: 5.2_

- [ ] 7. Run the end-to-end verification scenarios and production build
  - Execute the ten manual verification scenarios from the design testing strategy (anonymous and signed-in recording, editor test recording with builder-chat exclusion, signed-in and anonymous opt-out, persistence-failure resilience, access control, deleted-bot history, pagination, chrome changes)
  - Observable completion: all scenarios pass, and the production build completes without errors
  - _Requirements: 1.8, 1.9, 2.7, 3.6, 3.8, 4.3, 4.6_

## Implementation Notes
- Recording rules live in `lib/chat-session-store/record-chat-turn.ts`; `/api/chat` calls `swallowRecordingFailure` after `sendChat`. Clients must send `recording: { sessionId, surface, ownerSharing?, messageTimes? }`.
