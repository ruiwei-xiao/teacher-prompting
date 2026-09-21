# Gap Analysis: public-chat-identity

Date: 2026-09-21
Basis: `requirements.md` (Requirements 1–7) vs. current codebase

**Note:** Requirements were approved at design generation (`-y` on 2026-09-21). Gap analysis below informed the design decisions that follow.

## 1. Current State Investigation

### Public chat surface

- **Route**: `app/chat/[appId]/page.tsx` (24 lines). Server page resolves `appId` or `publicSlug`, 404s if unpublished, and renders `PublishedChatbot`. It does **not** call `auth()` and passes no signed-in flag.
- **UI**: `components/public/PublishedChatbot.tsx` (~513 lines, `"use client"`). Welcome message appears on mount; the composer is enabled immediately. No identity modal, no sign-in control, no session/user fetch.
- **Recording client**: `components/public/chat-recording.ts` generates a per-mount `sessionId` (`crypto.randomUUID()`) and `POST /api/chat` recording payload `{ sessionId, surface: "public", ownerSharing, messageTimes }`. Reload = new conversation (existing `bot-activity-sessions` contract).
- **Privacy**: `ChatPrivacyControls.tsx` + `chat-sharing.ts` — recording notice and owner-sharing toggle. Unchanged by this feature except that identity attribution must not break sharing/opt-out.
- **Auth on this page**: none on server or client. `POST /api/chat` is the only place that reads `auth()` for public chat (`userId = session?.user?.id ?? null`). Root layout has no `SessionProvider`; `TopNav` uses `fetch("/api/auth/session")`.

### Auth and return-to-chat

- **NextAuth v5** (`auth.ts`): JWT sessions; Google / Microsoft / Credentials. No `events` block. On-sign-in side effects already live in the `jwt` callback when `user` is present (`acceptPendingEmailInvitesOnSignIn`, `rememberDisplayProfile`) — the established hook for “something should happen at login.”
- **Sign-in UI**: `components/auth/SignInPanel.tsx` — OAuth buttons only; `signIn(provider, { callbackUrl })`. Home page (`/`) and `/auth/signin` already thread `callbackUrl`.
- **Proxy**: `proxy.ts` matcher does **not** include `/chat`, so public chat stays reachable while signed out. Existing return pattern is `/?callbackUrl={encoded path}` or passing `callbackUrl` into `SignInPanel`.
- **Gap**: no public-chat entry into that flow. Returning to `/chat/{id|slug}` after OAuth is supported by the existing `callbackUrl` mechanism and does not need a new auth provider.

### Session identity (load-bearing contracts)

`ChatSessionRecord` (`lib/chat-session-store/types.ts`): `participantId: string | null` and `participantName: string | null` with **null = anonymous**. No anonymous-visitor field.

`recordChatTurn` (`lib/chat-session-store/record-chat-turn.ts`) sets identity **only** from the server Auth.js session. Anonymous + `ownerSharing === false` skips persistence (`anonymous-unshared`). Recording failures are swallowed so chat continues.

`upsertSessionTurn` (`lib/chat-session-store/store.ts`):

- `identitiesMatch` requires the same `appId` **and** `participantId`.
- Postgres UPDATE writes `messages`, `shared`, `updated_at` only — **not** `participant_id` / `participant_name`.
- Mid-conversation login (null → user id, same `sessionId`) currently throws `Session identity mismatch`, recording stops for that conversation, UI chat still works.

Queries:

- My sessions: `listSessionsForUser` → `participant_id = userId` (anonymous excluded).
- Bot / workspace activity: shared sessions only; anonymous rows still appear, labeled `"Anonymous"`.
- Export (`lib/chat-session-api/export.ts`): CSV `participantId` empty and `participantName` `"Anonymous"` for null identity. JSON is the raw record. **No stable distinct-anonymous column.**

Display: `components/sessions/session-display.ts` (`ANONYMOUS_LABEL = "Anonymous"`). Workspace activity uses `nameMode: "workspace"` (participant in secondary text).

### Persistence and browser memory

- Store façade: Postgres vs `.data/chat-sessions.json`. `chat_sessions` uses `CREATE TABLE IF NOT EXISTS` only — **no `ALTER TABLE ADD COLUMN` yet**. Other stores (`lib/app-store/store.ts`) already add columns with `ADD COLUMN IF NOT EXISTS` at ensure-time. No ORM / migration framework (`tech.md`).
- **No application cookie read/write** in TS/TSX. Browser persistence elsewhere is `localStorage` via `lib/*/client.ts` (`theme`, `prompt-storage`).
- `components/common` has no dialog primitive. Feature dialogs use a local `fixed inset-0` overlay (`PublishDialog`, `ShareDialog`, `CreateWorkspaceDialog`, …).

### Tests

No test runner. Session behavior is `npx tsx scripts/verify-*.ts` (JSON-file backend). Relevant existing scripts: `verify-chat-session-store-write.ts` (identity mismatch), `verify-chat-session-recording.ts` (anonymous stores no PII), `verify-activity-export.ts` (empty anonymous `participantId`), `verify-published-chat-recording.ts`, `verify-chat-privacy-controls.ts`. None cover an identity gate, a remembered visitor id, or post-login reattribution.

### Adjacent spec constraint

`bot-activity-sessions` design currently states anonymous sessions store **no identifier (no IP, UA, or cookie)**. This feature **intentionally extends** that boundary for a remembered anonymous visitor identity on public chat only. Design must keep name/email/IP/UA out of anonymous rows and must not change editor-test recording.

## 2. Requirement-to-Asset Map

| Requirement | Existing asset | Gap |
|---|---|---|
| 1. Identity-choice modal on public chat | `PublishedChatbot`; ad-hoc `fixed inset-0` dialogs elsewhere | **Missing**: gate UI, signed-in detection on the public page, block composer until a choice. **Constraint**: page currently has no auth props; modal must not appear for signed-in visitors or editor tests |
| 1.3 Gate on every unauthenticated visit | Client mount + reload already remounts the page | **Missing**: per-visit gate even when a visitor id is already remembered. Do not treat “cookie exists” as “skip modal” |
| 1.6 Cannot dismiss without a choice | Dialogs elsewhere allow overlay/Escape dismiss | **Missing**: non-dismissible gate (different from existing dialogs) |
| 2. Login from modal + return | `SignInPanel` + `callbackUrl`; `/chat` not in proxy | **Missing**: wire public chat URL as `callbackUrl`. **Unknown**: whether to embed `SignInPanel` in the modal vs navigate to `/?callbackUrl=/chat/...` |
| 2.4 Cancel/fail sign-in | Returning to `/chat` unsigned-in remounts the page | Likely falls out of “gate on every unauthenticated open”; still **Missing** an explicit cancel path if sign-in is in-modal |
| 3. Remembered anonymous visitor identity | None. All anonymous sessions share `participantId: null` | **Missing**: issue/reuse identity, persist on the browser, attach to recorded public sessions without name/email. **Constraint**: dual Postgres/JSON store; `chat_sessions` has no extra identity column |
| 4. Sign-in after anonymous | No public-chat sign-in control | **Missing**: post-choice login CTA on the chat chrome |
| 4.3 Same conversation after mid-chat login | React message state continues; recording uses same `sessionId` | **Constraint**: `identitiesMatch` + no `participant_id` UPDATE → later turns fail to record. **Missing**: an allowed anonymous→signed-in transition for that session |
| 5. Map anonymous id ↔ user and reattribute | `jwt` callback on-sign-in pattern; My sessions filter is `participant_id = userId` | **Missing**: mapping persistence; reattribute **only still-unattributed** sessions; leave already-claimed sessions with the earlier user (Req 5.5). **Unknown**: cookie readable on the OAuth callback vs client claim after return |
| 5.4 Activity / workspace show display name | Lists already show `participantName` / `"Anonymous"` | Follows if rows (or a resolved view) get `participantId` + display name. **Missing**: that write/resolve path |
| 5.6 No cross-browser attach | Anonymous memory is browser-local by construction | OK if identity never syncs to the account except via that browser’s remembered id |
| 6.1–6.2 Unattributed stay `"Anonymous"` and out of My sessions | Existing display + `participant_id IS NOT NULL` filter | Keep this for unattributed rows. Attribution must flip those fields, or queries must join a mapping table |
| 6.3–6.4 Export distinct anonymous ids; attributed look signed-in | CSV/JSON export columns | **Missing**: stable unattributed identifier in downloads. **Constraint**: adding a CSV column is a breaking export-shape change for existing consumers of `verify-activity-export` |
| 7. Privacy copy on the modal | `ChatPrivacyControls` notice is about owner viewing, not linking | **Missing**: English copy that anonymous use is remembered on the browser and later sign-in links prior chats |

Complexity signals: UI workflow (gate + login return) + identity state machine (anonymous → attributed, first-claim-wins) + load-bearing store invariant change (`identitiesMatch`) + OAuth-redirect cookie/claim integration.

## 3. Implementation Approach Options

### Option A: Extend existing components only

Put the modal and login CTA inside `PublishedChatbot`; add `anonymousVisitorId` onto `ChatSessionRecord` / recording payload / export columns; set identity in `recordChatTurn`; reattribute by updating `participant_id` from the `jwt` callback.

- ✅ Fewest new files; recording stays on `/api/chat`; My sessions/activity/export keep working if `participant_id` is rewritten
- ❌ `PublishedChatbot` (~513 lines) absorbs gate, cookie, and sign-in
- ❌ `jwt` callback cannot read `localStorage`; only a cookie (or a later client call) works at OAuth time
- ❌ Tight coupling of visitor identity to session-row mutation; `identitiesMatch` still needs a special case

### Option B: New identity subsystem, query-time join

New store for visitor ids and `anonymous_id ↔ user_id` links. Session rows stay `participantId: null` forever for originally anonymous chats. My sessions, activity, and export join through the mapping at read time. Public chat talks to new identity APIs; recording payload unchanged.

- ✅ Session upsert invariant stays “null stays null”; no mid-conversation `participantId` change
- ❌ Every list/export/transcript path must learn the join (owner, workspace, My sessions, CSV/JSON)
- ❌ Easy to miss a reader and show `"Anonymous"` after login
- ❌ Sharing/opt-out and transcript ACL still key off `participantId` — anonymous-attributed users would not see those sessions in My sessions unless queries change everywhere

### Option C: Hybrid (new identity UI + mapping; extend session rows additively)

- **New UI**: dedicated identity-choice modal (non-dismissible) composed from `PublishedChatbot`; reuse `SignInPanel`/`callbackUrl` rather than a new auth stack. Small post-anonymous “Log in” control on the chat chrome.
- **New browser/server identity helper**: issue/reuse a visitor id remembered on that browser; server-readable so sign-in can claim it. Follow `lib/*/client.ts` for any browser API; cookie set via a small route if HttpOnly is chosen.
- **New mapping persistence**: record `anonymousVisitorId ↔ userId` at sign-in (Req 5.1), dual Postgres/JSON like other stores.
- **Extend `chat-session-store`**: additive `anonymousVisitorId` on public-chat rows (null for editor-test / already-signed-in-from-the-start). `ensurePostgresStore` gains `ADD COLUMN IF NOT EXISTS` (same pattern as `app-store`). Attribution **rewrites still-unattributed rows** (`participantId`/`participantName`) so existing My sessions, activity, workspace, and export signed-in paths work unchanged. Already-attributed rows are skipped (Req 5.5).
- **Recording**: pass visitor id on the public recording payload; `recordChatTurn` stores it without name/email. Allow a one-way anonymous→signed-in transition for the in-progress `sessionId` so Req 4.3 can keep one conversation.
- **Export**: keep `"Anonymous"` as the display name for unattributed rows; add a stable id column (or fill `participantId` with the visitor id only in downloads — see Research Needed).

- ✅ Query surfaces stay simple after attribution; identity rules live in one claim function
- ✅ Matches existing on-sign-in side-effect pattern
- ❌ Need a careful identity-transition in upsert (today a hard mismatch)
- ❌ Cookie vs client-claim timing must be designed around OAuth redirects

## 4. Effort and Risk

- **Effort: M (3–7 days)** — modal + cookie/id helper + one store column + mapping + claim/reattribute + export + verify scripts. Broader than a UI-only change because of the session identity invariant, but much smaller than `bot-activity-sessions` (no new activity product).
- **Risk: Medium** — patterns exist (store façade, `callbackUrl`, jwt on-sign-in hooks, swallowed recording errors), but (1) OAuth callback may not see a client-only id, (2) `identitiesMatch` is currently a safety rail, (3) shared-PC first-claim-wins must be exact, (4) `bot-activity-sessions` “no cookie” PII rule is being extended.

## 5. Recommendations for Design Phase

**Preferred approach to evaluate**: Option C (hybrid). Do not treat this as a final choice.

Key decisions to make in design:

1. **Where the visitor id lives on the browser** — HttpOnly cookie (server-set, readable in Auth.js callbacks) vs non-HttpOnly cookie vs `localStorage` plus a post-login claim from `/chat`. Requirements say “remembered on that browser,” not a specific storage API.
2. **When attribution runs** — `jwt` callback (consistent with workspace invite accept) vs explicit `POST` after returning to public chat vs both (callback for reliability, client for mid-chat).
3. **Session row vs mapping as source of truth** — rewrite `participantId` on unattributed rows (keeps My sessions/activity dumb) vs join forever (keeps history immutable). Req 5.5 (do not steal already-claimed sessions) is easier if the row itself holds the claimant.
4. **Mid-conversation transition** — dedicated `attributeSession` then subsequent turns use the signed-in id, vs relaxing `identitiesMatch` for null→userId only, vs new `sessionId` (would fail Req 4.3 continuity).
5. **Export shape** — new CSV column vs reusing `participantId` for unattributed visitor ids (today that column is empty for anonymous; filling it changes researcher spreadsheets and `verify-activity-export`).
6. **Signed-in detection on `/chat`** — pass `auth()` from the server page vs client `fetch("/api/auth/session")` (TopNav pattern). Must skip the modal for signed-in visitors on first paint if possible.

Research Needed (carry into design):

- Whether Auth.js OAuth callback on `/api/auth/callback/*` receives a cookie set from `/chat` (SameSite, Path, Secure). This determines if jwt-callback attribution is viable.
- Cookie lifetime and shared-PC behavior (long-lived id vs session cookie). Requirements require reuse on the same browser until it is forgotten.
- Whether in-progress messages already persisted as anonymous should be rewritten in place (same `session.id`) so transcripts stay one row.
- How workspace export (if any beyond bot-level download) should expose the same stable anonymous id.
- Copy for Req 7 vs the existing owner-visibility notice — two notices must not contradict.

Assumptions used in this analysis:

- Editor-test chats stay out of the gate and do not get anonymous visitor ids.
- Unattributed anonymous sharing-off remains “do not persist” (`anonymous-unshared`); there is then nothing to attribute.
- Cross-device anonymous identity remains out of scope.

---

## Summary

- **Feature**: `public-chat-identity`
- **Discovery Scope**: Extension (light discovery; gap analysis above)
- **Key Findings**:
  - Public chat has no auth props, no cookies, and no login entry. `SignInPanel` + `callbackUrl` already returns to `/chat/{id|slug}` after OAuth.
  - Session rows treat `participantId: null` as anonymous. Upsert rejects `null` → user id on the same `sessionId`. Lists and export already do the right thing once `participantId` / `participantName` are rewritten.
  - Auth.js `jwt` callbacks run in the Next.js route handler, so `cookies()` from `next/headers` can read a `Path=/; SameSite=Lax` cookie on the OAuth callback GET. A public-chat claim POST remains the backup and the mid-chat path.
  - OAuth navigates away and remounts `PublishedChatbot`, wiping React state. Conversation continuity (4.3) needs a tab `sessionStorage` resume of `sessionId` plus transcript reload after claim.

## Research Log

### Visitor id storage: cookie vs localStorage

- **Context**: Requirements say the anonymous identity is remembered on the browser. Claim must run at sign-in, including OAuth.
- **Sources Consulted**: Next.js 16 `cookies()` (`next/headers`); Auth.js v5 JWT callbacks; MDN `SameSite=Lax` (sent on top-level GET navigations).
- **Findings**: `localStorage` is invisible to `jwt`. A non-HttpOnly cookie could be read by XSS and forged in the recording JSON. An HttpOnly cookie set by a public POST, then read only on the server, keeps the id off the recording payload.
- **Implications**: Design issues the id with `Set-Cookie` (`HttpOnly`, `SameSite=Lax`, `Path=/`, ~400-day `Max-Age`). `/api/chat` stamps sessions from the cookie. Clients never send `anonymousVisitorId`.

### Mid-chat login and conversation continuity

- **Context**: Requirement 4.3 plus the objective “without abandoning the conversation.”
- **Sources Consulted**: `PublishedChatbot` (messages in React state); `createPublicChatRecording` (new UUID per mount); `GET /api/sessions/[sessionId]` transcript ACL (participant always allowed).
- **Findings**: OAuth unloads the page. Recorded turns already live on the session row. After claim, the signed-in user is the participant and can read that transcript.
- **Implications**: Before `signIn()`, write `{ appId, sessionId }` to `sessionStorage`. After return, claim, then hydrate from the transcript API and reuse that `sessionId`.

### Export shape

- **Context**: Requirement 6.3 needs distinct unattributed visitors; 6.4 wants attributed rows to look like ordinary signed-in rows. Today CSV `participantId` is empty for anonymous.
- **Sources Consulted**: `lib/chat-session-api/export.ts` `CSV_COLUMNS`; `scripts/verify-activity-export.ts`. Workspace activity lists sessions but has no separate download.
- **Findings**: Filling `participantId` with the visitor UUID would look like a user id and confuse researchers. A new `anonymousVisitorId` column is additive. Workspace UI picks up display names from rewritten `participantName` with no extra export path.
- **Implications**: Add `anonymousVisitorId` to CSV and to `ChatSessionRecord`. Keep `participantId` / `participantName` empty/`Anonymous` until attribution.

### Auth.js cookie readability

- **Context**: Whether jwt-callback attribution is viable.
- **Sources Consulted**: `auth.ts` jwt side effects (`acceptPendingEmailInvitesOnSignIn`); next-auth `5.0.0-beta.30`; Next.js 16 async `cookies()`.
- **Findings**: Callbacks already perform on-sign-in writes. OAuth callback is a same-site top-level GET, so `SameSite=Lax` cookies are included. If `cookies()` is unavailable in an Auth.js path, `POST /api/public-chat/identity/claim` on public-chat mount still claims.
- **Implications**: Dual claim (jwt + page POST) is belt-and-suspenders, not two sources of truth. The claim function is idempotent.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A Extend only | Modal inside PublishedChatbot; mutate session rows; jwt reads cookie | Few files | Bloated UI; client-supplied ids; jwt-only claim | Rejected as sole approach |
| B Query-time join | Mapping table; never rewrite `participantId` | Immutable history | Every list/export/ACL must join; easy to miss | Rejected |
| C Hybrid | New identity domain; rewrite still-unattributed rows; cookie + claim | Existing My sessions/activity/export keep working | Upsert must allow one-way promotion | Selected |

## Design Decisions

### Decision: Hybrid identity domain with row rewrite

- **Context**: Need distinct anonymous visitors and post-login My sessions/activity without rewriting every reader.
- **Alternatives Considered**:
  1. Option A — extend existing files only
  2. Option B — join mapping at read time
  3. Option C — new identity helpers + additive session column + rewrite unattributed rows
- **Selected Approach**: Option C. `anonymousVisitorId` on public-chat sessions; mapping table for 5.1; `attributeSessionsForVisitor` sets `participantId`/`participantName` only where `participantId IS NULL`.
- **Rationale**: My sessions already filter `participant_id = userId`. First-claim-wins (5.5) is a SQL/JSON predicate on the row.
- **Trade-offs**: Session identity is mutated once. History is not frozen as “always Anonymous.”
- **Follow-up**: Verify scripts for promotion and for leaving already-claimed rows untouched.

### Decision: HttpOnly cookie; server stamps recording

- **Context**: Remember identity on the browser; attach it without name/email.
- **Selected Approach**: Cookie `tp_anonymous_visitor_id`. `POST /api/public-chat/visitor` ensures it. `POST /api/chat` reads it for published anonymous (and leftover-cookie signed-in public) requests. Recording payload does not include the id.
- **Rationale**: jwt can see the cookie; XSS cannot trivially mint another visitor’s JSON id.
- **Trade-offs**: Extra public POST before chatting. Cookie is a tracker — disclosed in the modal (Req 7).
- **Follow-up**: Confirm `Set-Cookie` on both visitor POST and, as fallback, chat POST if the cookie is missing.

### Decision: Dual idempotent claim

- **Context**: Sign-in from modal, from the post-anonymous control, and OAuth return.
- **Selected Approach**: `claimAnonymousVisitorForUser(userId)` from jwt when `user` is present, and from `POST /api/public-chat/identity/claim` after public-chat hydration when signed in.
- **Rationale**: Same pattern as workspace invite accept. Page claim covers jwt cookie misses and already-open tabs.
- **Trade-offs**: Two call sites, one function.

### Decision: One-way upsert promotion plus pre-claim rewrite

- **Context**: Mid-conversation login must keep one `sessionId` (4.3).
- **Selected Approach**: Claim rewrites unattributed rows first. `identitiesMatch` also allows `participantId null` → signed-in id when `anonymousVisitorId` matches the cookie. `applyTurn` / Postgres UPDATE then persist the new participant fields.
- **Rationale**: Avoids a recording gap if a turn races the claim.
- **Trade-offs**: Relaxes a safety rail only for this one-way transition.

### Decision: sessionStorage resume for OAuth round-trip

- **Context**: OAuth remounts the chat client.
- **Selected Approach**: Before `signIn()`, store `{ appId, sessionId }`. After return and claim, `GET /api/sessions/{id}` hydrates messages and `createPublicChatRecording` reuses that id.
- **Rationale**: Turns are already on the server. Reload without login still starts a new conversation (existing contract + modal every visit).
- **Trade-offs**: Resume is tab-local; a second tab is a separate conversation.

### Decision: Additive CSV column `anonymousVisitorId`

- **Context**: Researchers must distinguish unattributed visitors without pretending the id is a user account.
- **Selected Approach**: New column; unattributed rows keep empty `participantId` and name `Anonymous`; attributed rows use account id and display name; visitor id remains for lineage when present.
- **Rationale**: Additive and explicit. Workspace list needs no new download.
- **Trade-offs**: Existing CSV consumers see a new header (`verify-activity-export` must update).

## Synthesis

- **Generalization**: One visitor-identity capability (cookie + session stamp + claim) serves the gate, recording, My sessions, activity, and export. Do not build a second analytics product.
- **Build vs adopt**: Adopt Auth.js `SignInPanel`/`callbackUrl`, Next.js `cookies()`, existing session store façade and transcript API. Build only the cookie helper, mapping store, claim function, and gate UI — no new npm dependency.
- **Simplification**: No query-time joins, no client-supplied visitor ids, no shared dialog primitive, no cookie for signed-in-from-the-start visitors who never chose anonymous.

## Risks & Mitigations

- Jwt cannot read the cookie — page claim POST still attributes before chatting.
- Shared PC steals history — only `participantId IS NULL` rows are rewritten.
- CSV header change surprises researchers — document in release notes; keep `Anonymous` display.
- `bot-activity-sessions` “no cookie” PII rule — this spec supersedes it for a non-PII visitor id on public chat only; still no IP/UA/name/email on anonymous rows.

## References

- `.kiro/specs/bot-activity-sessions/design.md` — session identity, sharing, export.
- Next.js cookies: https://nextjs.org/docs/app/api-reference/functions/cookies
- MDN SameSite: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite
