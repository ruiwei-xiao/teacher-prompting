# Implementation Plan

## 1. Foundation: visitor identity primitives

- [ ] 1. Foundation: visitor identity primitives
- [x] 1.1 (P) Publish English identity-gate copy
  - Provide a prominent login action label, a quieter anonymous continuation label, and two privacy sentences: anonymous use still remembers a visitor identity on this browser, and later sign-in associates those chats with the account
  - The copy module is the single source of those English strings and includes both disclosure sentences
  - _Requirements: 1.4, 7.1, 7.2_
  - _Boundary: IdentityChoiceModal copy_

- [x] 1.2 (P) Remember anonymous visitor identity on the browser
  - Issue a UUID visitor id when none exists, reuse a valid remembered id, treat a missing or invalid remembered id as a new visitor, and use an HttpOnly Lax path-root long-lived cookie
  - Cookie helper tests pass for reuse, new id after forgotten or invalid value, and HttpOnly Lax path-root options; helpers never accept a client-supplied id
  - _Requirements: 3.2, 3.3, 3.5, 3.6, 5.6_
  - _Boundary: VisitorCookie_

- [x] 1.3 (P) Persist visitor id on public-chat session records
  - Session records carry an optional anonymous visitor id; public-chat rows can store it; editor-test rows stay without it; older records without the field read as absent
  - A recorded public anonymous session round-trips with a visitor id and without a participant account; editor-test rows remain without a visitor id
  - _Requirements: 3.4_
  - _Boundary: ChatSessionStore_

- [x] 1.4 (P) Persist visitor-to-account links
  - Remember that a visitor id was used by a signed-in user; repeating the same pair is a no-op; the same visitor id may later also link to a different user
  - Dual-store write then read returns the pair; a second write of the same pair does not duplicate it
  - _Requirements: 5.1_
  - _Boundary: AnonymousVisitorStore_

- [ ] 1.5 Promote still-unattributed sessions to a signed-in user
  - Rewrite sessions that still have no participant account and match the visitor id to that user and display name; leave sessions already tied to another account unchanged; allow one-way anonymous-to-signed-in continuation of the same conversation when visitor ids match; keep rejecting other identity mismatches
  - Store tests pass: null-participant rows become the claimant; already-claimed rows stay put; matching visitor ids allow promotion on later turns; mismatched participant still fails
  - _Requirements: 4.3, 5.2, 5.3, 5.4, 5.5_
  - _Boundary: ChatSessionStore_
  - _Depends: 1.3_

## 2. Core: recording, claim, and downloads

- [ ] 2. Core: recording, claim, and downloads
- [ ] 2.1 (P) Stamp visitor id when recording public-chat turns
  - Recording accepts a server-supplied visitor id, ignores any visitor id in the client recording body, stores no name or email for anonymous participants, and still skips persistence when an anonymous visitor has owner sharing off
  - Recording verify: server-supplied id is stored, body-supplied id is ignored, anonymous rows have no profile PII, anonymous-unshared still skips
  - _Requirements: 3.4_
  - _Boundary: RecordChatTurn_
  - _Depends: 1.3_

- [ ] 2.2 (P) Claim anonymous history for a signed-in user
  - When a user signs in with a remembered visitor id, record the visitor-user link and promote still-unattributed sessions; missing visitor id returns no-visitor without failing the user; claim is idempotent
  - Claim verify: with a visitor id, a mapping exists and previously anonymous sessions now have that user id and display name; without a visitor id, result is no-visitor; a second claim does not steal another user's sessions
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.4_
  - _Boundary: ClaimAnonymousVisitor_
  - _Depends: 1.2, 1.4, 1.5_

- [ ] 2.3 (P) Include visitor id in activity downloads
  - Shared activity CSV and JSON include a stable anonymous visitor id; unattributed rows keep empty participant id and Anonymous name; attributed rows use the account id and display name
  - Export verify: header includes the visitor-id column; two unattributed visitors differ; an attributed row matches other signed-in rows for participant fields
  - _Requirements: 6.3, 6.4_
  - _Boundary: Owner export_
  - _Depends: 1.3_

## 3. HTTP and sign-in hooks

- [ ] 3. HTTP and sign-in hooks
- [ ] 3.1 (P) Issue or reuse the visitor cookie over HTTP
  - Unauthenticated POST ensures the cookie exists and returns success without echoing the visitor id in JSON; existing valid cookies are reused
  - Calling the endpoint twice keeps one visitor id; JSON body does not include the id
  - _Requirements: 3.2, 3.3, 3.5, 3.6_
  - _Boundary: VisitorCookie API_
  - _Depends: 1.2_

- [ ] 3.2 (P) Claim visitor history on sign-in
  - Authenticated claim POST reads only the cookie; unauthenticated claim is rejected; jwt on-sign-in runs the same claim and logs failures without blocking login
  - Signed-in claim with cookie returns claimed or no-visitor; unsigned claim is 401; sign-in still succeeds if claim throws
  - _Requirements: 5.1, 5.2, 5.6_
  - _Boundary: Claim API, Auth jwt callback_
  - _Depends: 2.2_

- [ ] 3.3 (P) Attach the visitor cookie when recording published chat
  - Published chat recording reads the visitor cookie on the server, may ensure it if missing, never takes the id from the client body, and does not stamp editor-test rows
  - A public anonymous turn persists with the cookie visitor id; a forged body id is ignored
  - _Requirements: 3.2, 3.4_
  - _Boundary: Chat API_
  - _Depends: 2.1, 1.2_

## 4. Published chat UI

- [ ] 4. Published chat UI
- [ ] 4.1 (P) Build the identity-choice modal
  - English non-dismissible overlay with prominent Log in to continue, quieter Continue anonymously, and both privacy sentences; overlay click and Escape do not count as a choice
  - Modal stays open without a choice and uses the shared copy strings
  - _Requirements: 1.1, 1.4, 1.6, 7.1, 7.2_
  - _Boundary: IdentityChoiceModal_
  - _Depends: 1.1_

- [ ] 4.2 (P) Start existing sign-in from public chat and remember the conversation
  - Reuse the existing sign-in panel with callback to the current public chat path; write a tab-local resume of the in-progress conversation before leaving; quieter Log in control exists for use after anonymous continuation; the public recording helper can reuse a provided conversation id
  - Sign-in is invoked with the public-chat callback path; resume storage round-trips app and conversation ids; recording helper reuse keeps the same conversation id
  - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3_
  - _Boundary: PublicChatSignInControl_

- [ ] 4.3 Host the gate on published chat
  - Pass signed-in state and callback path from the public chat page; unsigned visitors always see the modal even if a cookie exists; signed-in visitors never see it; composer, attachments, voice, and sharing stay disabled until a choice; Continue anonymously waits for a successful visitor cookie before unlocking; login cancel returning unsigned shows the modal again; signed-in mount claims visitor history even when this visit did not start anonymously
  - Unsigned open blocks sending until a choice; signed-in open has no modal, chatting is allowed, and claim runs on mount
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 2.4, 3.1, 5.2, 5.3_
  - _Boundary: PublicChatPage, PublishedChatbot_
  - _Depends: 4.1, 4.2, 3.1, 3.2_

- [ ] 4.4 Resume an in-progress conversation after later sign-in
  - After anonymous chatting, later login from the page reloads the resumed transcript, reuses the same conversation id, and records further turns as that signed-in user; failed resume falls back to a new welcome thread without blocking chat
  - Returning signed-in with a matching resume continues the same transcript as one conversation attributed to the user
  - _Requirements: 2.2, 2.3, 4.3, 5.2, 5.3, 5.4_
  - _Boundary: PublishedChatbot_
  - _Depends: 4.3, 3.2, 3.3_

## 5. Validation

- [ ] 5. Validation
- [ ] 5.1 Run identity domain verify scripts
  - Cookie reuse and options, copy disclosures, claim promote-null-only, and gate copy presence
  - Identity cookie, claim, and gate verify scripts pass via `npx tsx`
  - _Requirements: 5.2, 5.5, 7.1, 7.2_
  - _Boundary: ClaimAnonymousVisitor, VisitorCookie, IdentityChoiceModal copy_
  - _Depends: 1.1, 1.2, 2.2, 4.1_

- [ ] 5.2 Run activity identity regressions
  - Export visitor column; recording ignores a body-supplied id; unattributed sessions still render as Anonymous in list and transcript helpers; My sessions still excludes null participant ids; recording helper reuses a conversation id
  - Store-write, recording, export, session-display, and published-recording verifies pass via `npx tsx`
  - _Requirements: 3.4, 4.3, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: Owner export, RecordChatTurn, ChatSessionStore_
  - _Depends: 1.5, 2.1, 2.3, 4.2, 4.4_
