# Gap Analysis: async-rubric-calibration

Date: 2026-08-15
Basis: approved-draft `requirements.md` (16 requirements), core steering, codebase investigation.

## 1. Current State Summary

The codebase is a full-stack Next.js 16 App Router app with a consistent, reusable store/API pattern and **no** realtime, scheduling, or email infrastructure.

**Established patterns the feature can reuse:**

- **Store façade pattern** (`lib/app-store/store.ts`, `lib/workspace-store/store.ts`, `lib/star-store/store.ts`): `shouldUsePostgres()` env check; Postgres via `sql` tagged templates with lazy `CREATE TABLE IF NOT EXISTS` in `ensurePostgresStore()`; JSON-file fallback under `.data/`; public `export async function` that branches per backend. snake_case tables (`apps`, `workspace_members`, `user_stars`, ...).
- **API route pattern** (`app/api/workspaces/route.ts`): `const session = await auth()` → delegate to `lib/<domain>-api/*` handler returning `{ status, body }` → `NextResponse.json`.
- **Auth** (`auth.ts`, Auth.js v5 JWT): `session.user.id` + email; sign-in hook `acceptPendingEmailInvitesOnSignIn` (`lib/auth/accept-pending-email-invites.ts`) is a working precedent for "email-identity joins something on next sign-in".
- **AI adapter** (`lib/ai/providers.ts`): `sendChat(args): Promise<string>`, providers openai/google/anthropic, non-streaming; called by `app/api/chat/route.ts`. Published-chat path requires `publishedAt` and no session — the exact surface Req 12.3 (try-chat) needs.
- **Invite-link + landing pattern** (`app/workspace/invite/[token]/page.tsx`, `app/api/workspaces/join/[token]/route.ts`): a working precedent for the offering course-gate link (Req 1.2).
- **Read-only artifact viewing precedents**: `PeerBotPreview` (workspace peer inspect shows system prompt read-only) and `SharedProjectEditor` — directly reusable ideas for Req 12.
- **Selftest convention**: `*.selftest.ts` run via `npx tsx`, temp `.data/*-selftest` files; new store/api modules should ship the same.

**Confirmed absent (all "Missing" gaps below):**

- No WebSocket/SSE/EventSource anywhere; inter-panel sync is `window` CustomEvents (same browser only).
- No `vercel.json`/`vercel.ts`/`instrumentation.ts`; no cron or background-job machinery.
- No mail-sending dependency (`nodemailer` only as unused next-auth optional peer).
- `yjs` / `@lexical/yjs` are not direct dependencies and have no app imports (transitive only).
- No learner-facing surface other than published chat; no group chat, no document co-editing, no score entities.

## 2. Requirement-to-Asset Map

| Req | Capability | Existing asset | Gap tag |
|---|---|---|---|
| 1 | Offering + artifacts + course gate | App entity, publish flow, invite-link landing pattern | **Missing** new `offering` entity; pattern exists |
| 1.3/12 | Read-only prompt/brief/transcript, try-chat | `PeerBotPreview`, `/chat/[appId]` published path | Mostly **Reusable**; brief/transcript storage **Missing** |
| 2 | Matching queue, quorum of 3, expiry pings | None (workspace invites are unrelated) | **Missing** (new store + logic) |
| 3 | Persistent team space, recap on return | None | **Missing** (new store: team, chat, phase) |
| 4 | Dual clocks, absence, auto-finalize | No scheduler at all | **Missing** + **Constraint** (needs cron/scheduled execution) |
| 5 | Kickoff notices + recap post | Facilitator-message pattern must be created | **Missing** |
| 6 | Rotating Presenter/Critic rounds | None | **Missing** (deterministic state machine) |
| 7 | Shared rubric/notes co-edit + cursors | Lexical installed; `@lexical/yjs` transitive only; no sync server | **Missing** + **Unknown** (transport choice) |
| 8 | Blind scores + gated reveal | None (novel primitive, flagged in project description) | **Missing** |
| 9 | ≥2-point spread detection, targeted prompts | `sendChat` for wording | Spread calc trivial; orchestration **Missing** |
| 10 | Lock, addendum, late return | None | **Missing** (store-level state) |
| 11 | Facilitator (rules advance, LLM words, doc-aware) | `sendChat` adapter reusable | Orchestration **Missing** |
| 13 | Email notices to account email | None (no mail dep) | **Missing** + **Unknown** (provider choice) |
| 14 | Operator dashboard (queue + team progress + full read) | Workspace activity API as loose precedent | **Missing** |
| 15 | Team-scoped access, score privacy | Route-level auth pattern reusable | Pattern **Reusable**, ACL logic **Missing** |
| 16 | Separation from editor/Workspaces/live rooms | Boundary already respected by design | Satisfied by not touching those surfaces |

**Complexity signals:** multi-phase workflow state machine + scheduled execution + one external-service integration (email) + one realtime/document-sync integration (cursors). Everything else is CRUD on new tables following the established store pattern.

## 3. Hard Gaps (the four platform capabilities that do not exist)

### 3.1 Scheduled execution (Req 2.3–2.5, 4, 6.6, 7.6–7.7, 8.5, 9.5–9.6, 10.3)

The whole async design assumes clocks fire with nobody online. Nothing in the repo can do that today.

- **Option (i): Vercel Cron** hitting an internal route (e.g. hourly `/api/rubric-calibration/tick`). Needs a `vercel.json`/`vercel.ts` (first in repo) and an idempotent tick evaluator. Day-granularity timeouts (48h/3d/7d/14d, 5–7d pings) tolerate hourly ticks easily.
- **Option (ii): opportunistic evaluation** on any read/write of a space (evaluate expired clocks before serving). Zero infra, but clocks stall if *nobody* in the course opens anything — violates "auto-finalize on prolonged silence" and email pings. Only viable as a **complement**, not the mechanism.
- Recommendation for design: (i) + (ii) combined; tick route must be idempotent and authenticated (cron secret).
- Local/JSON-fallback dev has no cron: the tick route can be invoked manually or by the selftest; document this.

### 3.2 Email delivery (Req 13, 2.3, 5.1, 14.2)

No sender exists; Workspace invites deliberately don't send mail (requirements explicitly keep that unchanged).

- Marketplace/integration choice (e.g. Resend or SES) is a design-phase decision; volume is tiny (course-scale, event-driven).
- Needs: templated notices (team formed / your turn / nudge / reveal / finalized / queue ping), a `notices` log table for idempotency (don't double-send on tick retries), and a dev fallback (log-to-console / `.data` file) matching the store-fallback philosophy.
- **Research Needed**: provider selection + env/config conventions (tech.md requires documenting variable purpose, never values).

### 3.3 Realtime presence + co-editing (Req 7)

Two distinct needs, deliberately scoped small:

- **Document co-editing with cursors** on exactly two documents (shared rubric, shared notes), max ~3 concurrent editors + operator viewer.
  - Option (i): **Yjs + y-websocket-style provider** over an external realtime service (Liveblocks, PartyKit, or self-hosted WS). Lexical integration exists via `@lexical/yjs` (already in lockfile transitively; Lexical ^0.35 is a direct dep).
  - Option (ii): **Plain-text shared doc with debounced server saves + polling presence** (no CRDT). Meets Req 7.3 ("without full page reload") loosely, but genuine concurrent typing conflicts and cursor fidelity (Req 7.2 cursor + selection) push toward CRDT.
  - Constraint: Next.js API routes on Vercel don't host long-lived WS servers naturally; an external provider or a WS-capable function is required. **Research Needed**: Liveblocks vs PartyKit vs Vercel WS functions; auth handshake from Auth.js session; persistence of doc snapshots into the store (Postgres/JSON) so the doc survives with nobody connected (Req 3.1).
- **Chat/phase updates**: SSE or short polling is sufficient (chat is message-granularity; nothing in requirements demands sub-second chat push). Polling keeps infra zero; SSE from a route handler is also viable. Design decides.

### 3.4 Facilitator orchestration (Req 5, 6, 9, 11)

`sendChat` is a sufficient LLM primitive. What's missing is the layer around it:

- Deterministic **phase state machine** (check-ins, role rotation, submissions, spread calc, agreement, timeouts) — pure TypeScript, highly selftest-able, mirrors Bazaar's ClimateChangeAgent plan-steps concept.
- **Facilitator message writer**: scripted templates for announcements (Req 11.2) + `sendChat`-generated wording for revoice/follow-ups (Req 11.3) + doc-aware comments reading current doc text (Req 11.4).
- Req 11.5 already forbids LLM output from gating progression — the state machine is the sole advancer. This keeps the LLM integration low-risk.
- Facilitator needs its own AI credentials/config per offering (operator-configured, like an app's provider/model) — reuse `AppConfig`-style provider/model/apiKey fields on the offering.

## 4. Implementation Approach Options

### Option A: Extend existing components (workspace store, app editor)

Stretch `workspace-store` with team/queue tables; embed the learner UI in the existing editor components.

- ✅ Fewer new modules.
- ❌ Violates the spec's own boundaries: learners must not enter the editor (Req 16), teams must not be Workspace membership (Req 15.5, educator-workspaces out-of-scope). `AssistantPanel` (~6.3k lines) is explicitly not a base to build on.
- **Not viable.** Rejected by requirements, not just by taste.

### Option B: New feature domain, following existing patterns (recommended)

New vertical slice, structurally parallel to `educator-workspaces`:

- `lib/calibration-store/` — offerings, queue check-ins, teams, members, chat messages, doc snapshots, score submissions, clocks/absences, notices log (Postgres + JSON fallback, selftests).
- `lib/calibration-api/` — handlers for check-in, chat post, doc save, score submit, agree/confirm, operator dashboard, manual match.
- `lib/calibration-engine/` — pure state machine: phases, rotation, spread calc, clock evaluation, auto-finalize (selftest-heavy; the "ClimateChangeAgent rules" layer).
- `lib/calibration-facilitator/` — scripted templates + `sendChat` wording + doc-aware comments (the "LlmAgent/LlmDocumentAgent" layer).
- `app/activity/[offeringId]/...` routes: gate/landing, queue status, team space; `app/api/calibration/...` + tick route; operator dashboard page.
- `components/calibration/` — space layout (artifacts | shared doc | chat), score sheet, queue status, operator views.
- ✅ Clean boundary matches Req 15/16; each layer selftest-able; no risk to editor/Workspace surfaces.
- ❌ Most new files; realtime + email integrations still land here regardless.

### Option C: Hybrid (B + minimal shared-surface reuse)

Option B for all new domains, plus deliberate reuse instead of reimplementation:

- Course-gate link lands like `InviteJoinLanding`; try-chat links to existing `/chat/[slug]` (no new chat runtime); prompt/brief/transcript viewer borrows `PeerBotPreview` presentation; facilitator calls `sendChat` unchanged; notices reuse the sign-in-hook idea for "returning learner sees recap".
- Phasing that matches risk: **Phase 1** store + engine + space UI with polling (no cursors, console email) → **Phase 2** email provider + cron → **Phase 3** Yjs cursors on the two documents.
- ✅ Same clean boundary as B with less duplicated UI; de-risks the two external integrations by isolating them in later phases.
- ❌ Requires discipline that reused components stay read-only imports (no editor coupling creep).

## 5. Effort & Risk

| Slice | Effort | Risk | Justification |
|---|---|---|---|
| Store + engine (queue, teams, phases, clocks, scores, lock) | **L** | **Low–Medium** | Big surface but pure CRUD + pure functions on established patterns; gated reveal is novel but simple server-side state |
| Space UI (chat, artifacts, score sheet, recap) + operator dashboard | **L** | **Low** | Conventional Next.js pages/components; polling first |
| Cron tick + notices log + email provider | **M** | **Medium** | First scheduler and first mail dependency in repo; idempotency required |
| Facilitator (templates + LLM wording + doc-aware) | **M** | **Low–Medium** | `sendChat` reuse; risk contained because LLM never gates progression |
| Yjs co-editing + cursors (2 docs) | **M–L** | **Medium–High** | First realtime dependency; transport/hosting choice unresolved; scoped to 2 docs, ≤4 participants |
| **Total** | **XL (multi-week, phase-able)** | **Medium** | Four platform-first capabilities land at once unless phased |

## 6. Recommendations for Design Phase

1. **Adopt Option C** (new `calibration` domain + deliberate reuse + 3-phase rollout).
2. **Design the engine as pure functions** over a serializable team-state record; every timeout/rotation/reveal rule from Req 2/4/6–10 becomes a selftest case. This is the highest-leverage decision for correctness.
3. **Single idempotent tick** (`evaluateClocks(now)`) invoked by Vercel Cron *and* opportunistically on space reads; notices deduped via a log table.
4. **Gated reveal lives entirely server-side**: scores are separate rows never serialized to non-owners until `revealed_at` is set in one transaction (Req 8.2–8.4, 14.7, 15.3).
5. **Defer cursor tech to a bounded spike**: decide Liveblocks vs PartyKit vs Vercel WS in design; ship Phase 1 without cursors so the activity works end-to-end first (Req 7.2 lands in Phase 3).
6. **Carry forward Research Needed items**:
   - Email provider choice + env conventions (13)
   - Realtime doc-sync transport + Auth.js-session handshake + snapshot persistence (7)
   - Vercel cron minimum interval / limits on current plan (4)
   - ~~Score scale definition~~ — resolved 2026-08-15: integer 1–5 per criterion (user decision, reflected in Req 8.7)
   - ~~Where operator identity lives~~ — resolved in design discovery below: the offering creator is the operator
   - ~~Email provider / realtime transport / cron limits~~ — resolved in design discovery below

---

# Design Discovery (2026-08-15)

## Summary
- **Feature**: `async-rubric-calibration`
- **Discovery Scope**: Complex Integration (new feature domain + three platform-first capabilities: scheduling, email, realtime co-editing)
- **Key Findings**:
  - Liveblocks provides a hosted Yjs provider with first-class Lexical `CollaborationPlugin` integration (cursors, selection, presence, persistence) — eliminates the need to host any WebSocket server; free tier covers pilot scale (teams of 3).
  - Vercel Cron on Hobby is limited to once per day (±59 min precision); Pro allows per-minute. All activity deadlines are day-granularity (48h / 3d / 7d / 14d / 5–7d), so a daily tick plus opportunistic evaluation on space reads satisfies every timeout requirement on any plan.
  - Bazaar's agent split maps cleanly onto a two-layer facilitator: a deterministic phase engine (ClimateChangeAgent-style rules, sole authority for advancement per Req 11.5) and an LLM wording layer over the existing `sendChat` adapter (LlmAgent / LlmDocumentAgent-style revoicing and doc-aware comments).

## Research Log

### Realtime co-editing transport (Req 7)
- **Context**: Req 7.2–7.4 require Google-Docs-style cursors, selections, and live content sync on exactly two documents per team; the repo has no realtime infrastructure and Next.js API routes do not naturally host long-lived WebSocket servers.
- **Sources Consulted**: Liveblocks docs (Lexical + Yjs + Next.js guide, `LiveblocksYjsProvider`), 2026 comparisons of Liveblocks vs PartyKit vs Hocuspocus vs self-hosted y-websocket.
- **Findings**:
  - Liveblocks: managed Yjs WebSocket provider, built-in presence/cursors, official Lexical `CollaborationPlugin` path, automatic document persistence, session auth via a server endpoint we control. Free tier suits pilot volume.
  - PartyKit (Cloudflare): more control, but requires writing and operating a Durable-Objects server plus custom cursor UI.
  - Hocuspocus / y-websocket: self-hosted Node WS server — a new deployable that Vercel functions do not naturally host; disproportionate ops burden for 2 documents × ≤4 participants.
- **Implications**: Adopt Liveblocks. One room per team; two Yjs documents (rubric, notes) inside the room; auth endpoint bridges the Auth.js session to a room token scoped by team membership (operator gets read-only access). Server-side readable text (facilitator, operator view, auto-finalize) comes from client-pushed debounced plain-text snapshots stored in Postgres/JSON — the Yjs doc is authoritative while unlocked, the snapshot is a server-readable projection, and locking copies the last snapshot into the final deliverable.

### Scheduled execution limits (Req 2.3–2.5, 4, 6.6, 7.6–7.7, 8.5, 9.5–9.6, 10.3)
- **Context**: Clocks must fire with nobody online; repo has no `vercel.json` or job machinery.
- **Sources Consulted**: Vercel cron docs (usage-and-pricing, limits, Jan 2026 changelog).
- **Findings**: 100 cron jobs/project on all plans. Hobby: min interval once per day, invocation anywhere within the scheduled hour. Pro: per-minute. Cron requests carry a secret (`CRON_SECRET`) for authentication.
- **Implications**: One idempotent `tick` route scheduled daily (Hobby-compatible; hourly if the project moves to Pro), complemented by opportunistic clock evaluation whenever a space or queue is read. Worst-case drift ≈ 1 day, acceptable against 2–14-day deadlines. Local/JSON-fallback dev invokes the tick manually or via selftest.

### Email delivery (Req 13, 2.3–2.4, 5.1, 14.2)
- **Context**: No mail dependency exists; Workspace invites intentionally do not send mail.
- **Sources Consulted**: Vercel Marketplace email integrations; Resend Node SDK docs.
- **Findings**: Resend is the standard Vercel-ecosystem transactional sender with a minimal Node SDK (`resend.emails.send`) and a free tier well above course-scale volume.
- **Implications**: Adopt Resend behind a thin `calibration-notices` module with a console/`.data` fallback when `RESEND_API_KEY` is unset (mirrors the store-fallback philosophy). All sends are deduplicated through a `calibration_notices` log keyed by a deterministic dedupe key so tick retries never double-send.

### Bazaar behavioral mapping (Req 5, 6, 9, 11)
- **Context**: User directed that Bazaar (DANCEcollaborative) inform agent behavior, not implementation (Java/live-room stack is incompatible with the async Next.js design).
- **Findings**: ClimateChangeAgent → scripted announcements, turn-gating, rotation, private-ping patterns → the deterministic phase engine + scripted templates. LlmAgent → revoicing and facilitation prompts → `sendChat` wording layer. LlmDocumentAgent → reads shared doc, comments in chat → doc-snapshot-aware facilitator comments. Gated reveal has no Bazaar analog and is a new server-side primitive.
- **Implications**: Engine advances phases exclusively from deterministic facts (check-ins, submissions, rotation, spread, agreement, timeouts) — LLM output never gates progression (Req 11.5).

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Event-sourced engine over team state record | Pure `evaluate/apply` functions on a serializable team state; effects (messages, notices, phase moves) returned as data | Every timeout/rotation/reveal rule selftest-able; single writer path | State record must stay JSON-serializable | **Selected** — mirrors Bazaar plan-steps concept |
| Workflow library / durable orchestration | Adopt a workflow engine for phases | Built-in retries | New heavyweight dependency; day-granularity clocks do not need it | Rejected — over-engineering for 7 phases |
| Extend workspace-store / editor | Reuse existing entities | Fewer modules | Violates Req 15.5 / 16 boundaries | Rejected in gap analysis (Option A) |

## Design Decisions

### Decision: Liveblocks for Yjs sync, presence, and cursors
- **Context**: Req 7 cursors/co-editing with no realtime infra and no WS hosting.
- **Alternatives Considered**: 1. PartyKit (Cloudflare Durable Objects, custom cursor UI) 2. Self-hosted Hocuspocus/y-websocket (new server to operate) 3. Polling text sync without CRDT (fails cursor/selection fidelity of 7.2).
- **Selected Approach**: `@liveblocks/react` + `@liveblocks/yjs` + Lexical `CollaborationPlugin`; one room per team keyed `calibration:{teamId}`; access tokens issued by our auth endpoint from the Auth.js session.
- **Rationale**: Zero infrastructure, official Lexical path, presence/cursors prebuilt, pilot-scale free tier.
- **Trade-offs**: Vendor dependency and per-MAR pricing at scale; document content lives in two places (Liveblocks doc + our snapshots) with a defined authority rule.
- **Follow-up**: Verify room permission flip to read-only at lock; verify operator read-only token; measure snapshot debounce (target ≤5 s after idle).

### Decision: Single idempotent tick + opportunistic evaluation
- **Context**: Hobby cron is daily-only; deadlines are day-granularity.
- **Selected Approach**: `POST /api/calibration/tick` (CRON_SECRET-authenticated) walks queues and unfinalized teams calling the pure engine `evaluate(state, now)`; the same evaluation runs before serving any space/queue read.
- **Trade-offs**: Up to ~1 day drift on Hobby; acceptable per requirement granularity.
- **Follow-up**: Ensure all effects are idempotent (notices deduped, absence marks keyed by step).

### Decision: Gated reveal as server-side transactional state
- **Context**: Req 8.2–8.4, 14.7, 15.3 — no path may leak held scores.
- **Selected Approach**: Score rows are never serialized to non-owners until the team's `scores_revealed_at` is set in one transaction; API responses filter by ownership; facilitator prompts and notices only reference submission facts, never values; operator view is the sole pre-reveal exception (14.5) and never triggers reveal (14.7).
- **Follow-up**: Selftest that pre-reveal space payloads for member B contain no member A score values.

### Decision: Fixed values inside required ranges
- Queue re-confirmation ping: every 6 days (within 5–7, Req 2.3); expiry after 2 missed pings ≈ 12 days (2.4); operator stuck-queue listing at 10 days (within 10–14, 2.5 / 14.1). Recorded so implementation and tests share constants.

### Synthesis outcomes
- **Generalization**: one `deadline` primitive drives queue pings, per-person clocks, and group clocks; one `agreement` primitive drives both merge-completion and final consensus (10.2); one `notices` primitive with dedupe covers all seven notice kinds (13.1–13.2).
- **Build vs adopt**: adopt Liveblocks (realtime), Resend (email), Vercel Cron (scheduling); build phase engine, gated reveal, facilitator orchestration (no off-the-shelf fit).
- **Simplification**: chat/phase updates use short polling (no SSE/WS — nothing requires sub-second push); no separate kickoff phase (formation posts recap and immediately opens critique round 1 per 5.3); facilitator is one participant identity, not multiple agents.

## Risks & Mitigations
- Liveblocks outage or auth failure → documents degrade to read-only snapshot view; chat, scoring, and phase progression are unaffected (they never depend on Liveblocks).
- Tick double-execution / retries → all effects idempotent; notices deduped by unique key; absence marks keyed by (team, user, step).
- LLM wording failures (`sendChat` error) → scripted-template fallback posts; progression never blocked (engine advances regardless, Req 11.5).
- Snapshot lag vs live Yjs doc → snapshot marked with `updated_at`; facilitator comments quote snapshot text only; lock waits for a final snapshot fetch.

## References
- [Liveblocks: Lexical + Yjs + Next.js guide](https://liveblocks.io/docs/guides/how-to-create-a-collaborative-text-editor-with-lexical-yjs-nextjs-and-liveblocks) — cursor/provider integration path
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby daily-only limit, Pro per-minute
- [Vercel changelog 2026-01-20](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan) — 100 crons/project all plans
- [Bazaar (DANCEcollaborative)](https://github.com/DANCEcollaborative/bazaar) — behavioral reference for agent roles (ClimateChangeAgent, LlmAgent, LlmDocumentAgent)
