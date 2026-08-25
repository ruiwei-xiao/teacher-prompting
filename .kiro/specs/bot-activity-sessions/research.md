# Gap Analysis: bot-activity-sessions

Date: 2026-08-24
Basis: `requirements.md` (Requirements 1-6) vs. current codebase

## 1. Current State Investigation

### Persistence patterns (directly reusable)

- **Store façade pattern** (`lib/star-store/store.ts`, `lib/app-store/store.ts`, `lib/calibration-store/store.ts`): every store detects Postgres via `shouldUsePostgres()` (checks `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL`), lazily runs `CREATE TABLE IF NOT EXISTS` in `ensurePostgresStore()`, and falls back to a JSON file under `.data/` for local development. Each exported function branches `...InPostgres` / `...InFile`. No ORM, no migration framework.
- **Message persistence precedent**: `calibration_messages` (`id, team_id, author_kind, author_user_id, kind, body, phase, created_at`) with `appendMessage(teamId, message)` in `lib/calibration-store/store.ts`. A chat-session store can follow the same shape (sessions table + messages table).

### Chat surfaces (where recording must hook in)

- **Public chat**: `app/chat/[appId]/page.tsx` → `components/public/PublishedChatbot.tsx`. Messages live only in React state; each turn is `POST /api/chat` with the **full message history** in the body (non-streaming, returns `{ reply }`). `ChatMessage` is a locally defined type (`role, content, imageUrl?`); there is no shared chat-message contract and no client-side persistence.
- **Editor test chat**: `components/editor/AssistantPanel.tsx` (~6,300 lines; no separate PreviewPanel). Two modes: assisted test-case rail (test cases with `StudentProfile` from `lib/test-case-students.ts`) and a single-thread "Try chat". Both call `POST /api/chat` with an explicit `system` prompt. Conversations are React state only.
- **Third consumer of `/api/chat`**: `components/editor/LeftChat.tsx` (the pedagogical-agent builder assistant) also posts to `/api/chat` with its own `system`. This is *authoring assistance*, not a bot conversation, and must NOT be recorded.
- **Auth boundary in `/api/chat`** (`app/api/chat/route.ts`): requests without `system` are treated as published-bot requests and allowed anonymously (bot must have `publishedAt`); requests with `system` require a signed-in user. This existing branch already distinguishes "public chat" from "editor-originated" traffic.

### UI integration surfaces

- **Editor layout** (`app/app/[appId]/editor/page.tsx`): no tab mechanism exists. Layout is `EditorChrome` (header) + `RightRail` + optional `LeftChat` + `InstructionDoc` + optional `AssistantPanel`. An "activity view" needs either a new toggled panel/section or a sibling route (e.g. `/app/[appId]/activity`).
- **Sidebar** (`components/app-shell/WorkspaceSidebar.tsx`): nav items are `Link`s with constants — `MY_BOTS_HREF` (`lib/workspace-ui/nav.ts`), `STARRED_HREF` (`lib/star-ui/nav`), `ACTIVITY_HREF` = `/activity` (`lib/calibration-ui/offering.ts`). Renaming "Activities" → "Collaborative activities" is a label change; "My sessions" needs a new constant + route.
- **My bots card** (`components/dashboard/AppCard.tsx`, used by `components/dashboard/AppGrid.tsx`): flat buttons, not a dropdown — `{ctaLabel}` ("Open bot" passed from AppGrid), "Share", "Delete bot", optional star toggle. `DeleteBotDialog` already requires typed confirmation. Label/icon changes are local to these two components.
- **API route conventions** (`app/api/apps/[appId]/route.ts`, `app/api/stars/route.ts`): `auth()` → ownership check via store (`getAppById(id, userId)`) → JSON with meaningful status codes. New session APIs should follow this exactly.
- **Participant display names**: `users` / `user_display_profiles` exist in `lib/auth/user-store.ts`; session lists can resolve display names from there.

## 2. Requirement-to-Asset Map

| Requirement | Existing asset | Gap |
|---|---|---|
| 1. Session recording | Store façade pattern; `/api/chat` receives full history each turn; auth branch already separates public vs editor traffic | **Missing**: session/message store, session lifecycle (create on first message, append per turn), session ID continuity on the client |
| 1.2 Editor test marking | `system`-present requests identify editor traffic | **Unknown**: `/api/chat` cannot currently tell AssistantPanel test chats apart from LeftChat builder-assistant chats — a payload discriminator is required |
| 1.6/1.9 Anonymous + opt-out discard | Anonymous access path exists in `/api/chat` | **Missing**: anonymous participant handling, discard-on-opt-out (requires an internal delete operation even though user-facing deletion is out of scope) |
| 2. Creator activity view | Editor layout, ownership-check convention | **Missing**: activity UI, session list/transcript read APIs, pagination; **Constraint**: no tab mechanism in editor |
| 2.5 Card → activity deep link | AppCard/AppGrid | **Missing**: a URL-addressable activity destination (favors a dedicated route over an editor-internal panel state) |
| 3. My sessions | Sidebar nav pattern, auth | **Missing**: new nav item, `/sessions` page, per-user session query |
| 3.6 Deleted-bot sessions | `DELETE /api/apps/:id` deletes the app row | **Constraint**: sessions must snapshot the bot name (denormalized) or tolerate missing joins so transcripts survive bot deletion |
| 4.1/4.5-4.8 Notice + sharing toggle | `PublishedChatbot` UI | **Missing**: notice, toggle UI, `shared` flag on session, sticky-off semantics |
| 4.3 Access control | Route conventions | **Missing**: viewer authorization (owner OR participant) in new read APIs |
| 5. Navigation naming | `WorkspaceSidebar` label strings | Trivial label change |
| 6. Card actions | `AppCard` flat buttons | Local UI change (labels, icons, accessible labels) |

Complexity signals: mostly CRUD + one workflow subtlety (session lifecycle/idempotent append) + one cross-cutting privacy rule (sharing flag filtering in every owner-facing query).

## 3. Implementation Approach Options

### Option A: Extend existing components only

Record sessions inside `app/api/chat/route.ts` (it already sees every turn with full history); render activity as a new toggled panel inside the existing editor page; add list views into existing pages.

- ✅ Single recording point covers both surfaces; no client recording calls; fewest new files
- ❌ `/api/chat` gains a second responsibility and must disambiguate three callers
- ❌ Editor-internal panel state is not URL-addressable, complicating the My bots card deep link (Req 2.5)
- ❌ AssistantPanel is already ~6,300 lines; embedding more UI there worsens it

### Option B: New components everywhere

New `lib/chat-session-store/`; clients call new dedicated session APIs (`POST /api/sessions`, `POST /api/sessions/[id]/messages`) explicitly after each turn; new routes `/app/[appId]/activity` and `/sessions` with their own components.

- ✅ Clean separation; `/api/chat` untouched; sessions testable in isolation
- ❌ Recording depends on extra client round-trips per turn (more failure modes, easy to miss a surface, duplicated client logic in PublishedChatbot and AssistantPanel)
- ❌ Two requests per turn where one would do

### Option C: Hybrid (recommended)

- **New store**: `lib/chat-session-store/` following the star/calibration façade pattern (tables: `chat_sessions`, `chat_session_messages`; snapshot `bot_name` on the session for deleted-bot tolerance).
- **Recording extends `/api/chat`**: the route already receives every turn and already branches public vs editor; add a small, failure-swallowing recording step (client passes `sessionId` + `sharing` + a surface discriminator; LeftChat traffic explicitly excluded). Honors Req 1.8 naturally (record errors never block the reply).
- **New read/query APIs and pages**: `GET /api/apps/[appId]/sessions` (owner-scoped, shared-only, paginated), `GET /api/sessions` (participant-scoped), transcript endpoint with owner-or-participant authorization; new URL-addressable activity destination for the editor and a `/sessions` page; small inline edits to `WorkspaceSidebar`, `AppCard`, `AppGrid`, `PublishedChatbot`.

- ✅ One server-side recording point; deep-linkable activity view; new domain logic isolated in its own store
- ❌ `/api/chat` request contract changes (all three callers must be updated deliberately)
- ❌ Requires careful design of the surface discriminator and idempotent append

## 4. Effort and Risk

- **Effort: L (1-2 weeks)** — one new store with two tables, contract change to `/api/chat`, two new page surfaces, transcript viewer, plus privacy filtering and small UI cleanups across sidebar/cards.
- **Risk: Medium** — patterns are all established in-repo (store façade, route conventions), but the `/api/chat` contract change touches three callers, and the sharing/anonymity rules must be enforced consistently in every owner-facing query. No automated test suite exists, so verification is manual + production build.

## 5. Recommendations for Design Phase

**Preferred approach**: Option C (hybrid).

Key design decisions to make:
1. **`/api/chat` recording contract**: exact request fields (`sessionId`, `surface`, `sharing`), how the route distinguishes AssistantPanel test chats from LeftChat builder chats, and idempotent persistence given the client sends full history each turn (append-delta vs upsert).
2. **Session continuity**: client-side session ID generation and "new conversation" boundaries (page reload, test-case switch — likely one session per test case run in the editor).
3. **Activity view placement**: dedicated route (e.g. `/app/[appId]/activity`) vs editor-internal section, given Req 2.5 requires a direct link and the editor has no tab mechanism.
4. **Sharing semantics**: `shared` flag storage, sticky-off enforcement, and discard behavior for anonymous opt-out (internal delete path).
5. **Pagination**: no in-repo precedent for paginated lists; choose cursor vs offset for session lists.

Research Needed (carry into design):
- Whether editor test-case metadata (test case name / student profile) should be stored on the session for creator context, or kept minimal per requirements.
- Display-name resolution for participants via `user_display_profiles` vs `users.name`.

---

# Design Discovery & Decisions (2026-08-24)

## Summary
- **Feature**: `bot-activity-sessions`
- **Discovery Scope**: Extension (light discovery; gap analysis above provides the codebase survey)
- **Key Findings**:
  - `/api/chat` (`app/api/chat/route.ts`) receives `{ appId, system?, messages, visualizationState? }` and already derives `isPublishedRequest = !system?.trim()`; anonymous access is allowed only for published requests. This is the single choke point through which every bot conversation flows.
  - Three client callers confirmed: `PublishedChatbot.send()` (no `system` → public), `AssistantPanel` at two call sites (`requestPreviewReply` ~line 4848 and the test-case/try-chat send ~line 5804, both with `system`), and `LeftChat` (~line 102, with `system`; builder assistance — must not be recorded).
  - Clients send the **full message history** every turn; the welcome message and client-side error apologies live in that history. There is no per-message timestamp on the client `ChatMessage` type.
  - User messages can embed base64 `imageUrl` data URLs (multi-MB); persisting them verbatim would bloat rows.

## Research Log

### How should recording hook into the request flow?
- **Context**: Req 1.1-1.8 require recording on both surfaces without breaking chat on failure.
- **Sources Consulted**: `app/api/chat/route.ts`, `components/public/PublishedChatbot.tsx`, `components/editor/AssistantPanel.tsx`, `components/editor/LeftChat.tsx`.
- **Findings**: All conversation traffic already passes through `/api/chat` with full history; the route already authenticates and resolves the app (including `owner_id`). Callers can be distinguished by an explicit opt-in `recording` field rather than inference.
- **Implications**: Record server-side inside `/api/chat` after a successful model reply, guarded by try/catch (Req 1.8). `LeftChat` sends no `recording` field and is therefore never recorded. Surface claims are validated against the existing `isPublishedRequest` branch.

### Message storage shape: separate table vs JSONB transcript
- **Context**: `calibration_messages` precedent uses a per-message table; but chat clients resend full history each turn.
- **Findings**: A per-message table requires delta computation or dedup per turn. Because the client sends the complete transcript every turn and transcripts are read whole (never queried per-message), a `messages` JSONB column on the session row, replaced idempotently on each turn, is simpler and retry-safe. JSON-file fallback is trivial.
- **Implications**: Single `chat_sessions` table; one upsert per turn; no migration framework needed (matches `CREATE TABLE IF NOT EXISTS` convention).

## Design Decisions

### Decision: Server-side recording inside `/api/chat` with explicit client `recording` payload
- **Context**: Option C from gap analysis; need to include editor test chats and exclude builder-assistant chats.
- **Alternatives Considered**:
  1. Infer surface from `system` presence only — cannot separate AssistantPanel from LeftChat.
  2. Separate recording API called by clients per turn — extra round-trips, easy to miss a surface, more failure modes.
- **Selected Approach**: Clients that want recording send `recording: { sessionId, surface, ownerSharing?, timestamps }` in the `/api/chat` body. The route validates surface consistency (public ⇔ no `system`; editor-test ⇔ `system` present + authenticated owner) and persists after replying.
- **Rationale**: One recording point, no extra round-trips, explicit opt-in makes LeftChat exclusion structural rather than heuristic.
- **Trade-offs**: `/api/chat` contract grows; all three callers touched deliberately (two modified, one intentionally untouched).
- **Follow-up**: Verify AssistantPanel's two call sites both attach the payload; verify LeftChat remains unrecorded.

### Decision: Client-generated session ID (UUID) as identity and anonymous capability
- **Context**: Sessions must be continuous across turns (Req 1.7) and anonymous participants need authority to discard their session (Req 1.9) without accounts.
- **Selected Approach**: The client generates `crypto.randomUUID()` when a conversation starts and reuses it every turn; a new conversation (page load, editor test-case reset) generates a new ID. On upsert the server verifies the existing row's `app_id` and participant match the request. For anonymous sessions, knowledge of the unguessable UUID is the capability required to turn sharing off (which discards the session).
- **Rationale**: Avoids a session-creation round-trip; makes recording idempotent per turn; gives anonymous users a deletable handle without PII.
- **Trade-offs**: Trusting client-supplied IDs requires ownership validation on upsert to prevent cross-session writes.

### Decision: Replace-transcript-per-turn (JSONB) instead of append-delta
- **Selected Approach**: Each recorded turn replaces the session's `messages` JSONB with the full history received (image data URLs stripped and flagged `imageOmitted`; per-message timestamps supplied by the client, server-filled when missing).
- **Rationale**: Idempotent under retries; matches what clients already send; transcripts are always read whole.
- **Trade-offs**: Slightly larger writes per turn (acceptable at tutoring-conversation sizes); client-side error apologies present in history get recorded (acceptable — they are part of what the participant saw).

### Decision: Snapshot `app_name`, `owner_id`, and `participant_name` on the session row
- **Context**: Req 3.6 (sessions survive bot deletion) and participant display in owner lists.
- **Selected Approach**: Denormalize these at recording time instead of joining `apps`/`users` at read time.
- **Rationale**: `DELETE /api/apps/:id` removes the app row; sessions must remain renderable. Display-name staleness is acceptable.
- **Trade-offs**: Renames of bots/users are not reflected in old sessions.

### Decision: Activity view as a dedicated route `/app/[appId]/activity` linked from editor chrome and My bots card
- **Context**: Req 2.1 (view inside the editor) + Req 2.5 (direct link from card); the editor has no tab mechanism.
- **Alternatives Considered**: Editor-internal toggled panel — not URL-addressable, complicates Req 2.5, and grows the already ~6,300-line AssistantPanel area.
- **Selected Approach**: New sibling route rendered with an "Activity" navigation control in `EditorChrome`, satisfying "tab or section" as a chrome-level tab.
- **Trade-offs**: Navigating leaves the editing surface; acceptable and consistent with deep-linking.

### Decision: Sharing toggle semantics (sticky off, branch by participant kind)
- **Selected Approach**: Toggle rendered next to the recording notice, on by default. Turning it off calls a sharing endpoint: signed-in participant → session flagged `shared = false` (kept for My sessions, hidden from owner); anonymous participant → session row deleted. Subsequent turns carry `ownerSharing: false` so anonymous conversations are simply never persisted. The endpoint only supports turning sharing off; re-enabling within the same conversation is not accepted (Req 4.6).
- **Trade-offs**: An internal delete path exists even though user-facing deletion is out of scope; documented as such.

### Decision: Offset pagination for session lists
- **Context**: Req 2.8; no pagination precedent in repo.
- **Selected Approach**: `limit`/`offset` query params (default limit 20) on list endpoints; transcripts fetched per session on selection.
- **Rationale**: Simplest correct approach at expected volumes; cursor pagination deferred until scale demands it.

### Synthesis outcomes
- **Generalization**: Owner activity list and My sessions list are the same underlying capability (query sessions by dimension + view transcript); one store, one list component, one transcript component, two thin views.
- **Build vs adopt**: No new dependencies. Persistence follows the in-repo store façade pattern; no ORM/queue/library introduced.
- **Simplification**: No separate messages table; no session-creation endpoint (implicit creation on first recorded turn); no editor tab framework (chrome link to sibling route); test-case metadata NOT stored on sessions (kept minimal per requirements — only the surface marker).

## Risks & Mitigations
- `/api/chat` contract change touches three callers — mitigation: recording is opt-in; untouched callers behave exactly as before.
- Sharing rules enforced in every owner-facing query — mitigation: single store function (`listSessionsForApp`) owns the `shared = true` filter; owner transcript access re-checks `shared`.
- AssistantPanel is very large — mitigation: change confined to the two fetch call sites plus session-ID state per test case.
- No automated test suite (per steering) — mitigation: manual verification scenarios + production build check defined in design Testing Strategy.
