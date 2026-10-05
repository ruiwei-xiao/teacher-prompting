# Research & Design Decisions

## Summary

- **Feature**: `bot-config-versioning`
- **Discovery Scope**: Extension
- **Key Findings**:
  - A bot is one `AppConfig` row. Publish is `publishedAt` plus `publicSlug` on that row. Public chat reads the same row, so a draft and a published configuration cannot diverge until chat stops reading the live row.
  - Schema changes are additive `CREATE TABLE` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` inside `ensurePostgresStore`, with a parallel JSON file. There is no migration runner.
  - Session identity is fixed in `applyTurn` on insert. Later turns spread the existing row and do not rewrite identity fields. A nullable `configVersionId` set only on insert matches that pattern.
  - The assisted-authoring publish check is client-only because test-case progress is not stored on the server.

## Research Log

### Where settings and publish live

- **Context**: Versioning has to wrap the existing save and publish paths without a second editor model.
- **Sources Consulted**: `lib/app-store/types.ts`, `lib/app-store/store.ts`, `lib/app-store/fork.ts`, `app/api/apps/[appId]/route.ts`, `app/app/[appId]/editor/page.tsx`, `components/editor/InstructionDoc.tsx`, `components/editor/AppSettingsDialog.tsx`
- **Findings**:
  - Snapshotted fields already live on `AppConfig`: `name`, `systemPrompt`, `provider`, `model`, `variability`, `assistedAuthoringMode`, `builderState`.
  - API keys, slugs, `publishedAt`, sharing, community listing, fork credit, and stars do not.
  - Prompt saves are a 600ms debounce PATCH of `systemPrompt`. Settings and publish are explicit PATCHes. All of them call `updateApp`.
  - `forkApp` copies the current tutoring fields into `createApp` and does not copy publish or share state.
- **Implications**: `updateApp` and `createApp` are the only write seams for versions. Peer preview and shared-project pages can keep reading the app row if that row stays the draft.

### Public chat versus editor test

- **Context**: Requirement 5 sends students and the owner to different configurations.
- **Sources Consulted**: `app/api/chat/route.ts`, `components/public/PublishedChatbot.tsx`, `components/editor/AssistantPanel.tsx`, `components/editor/LeftChat.tsx`
- **Findings**:
  - Public chat omits `system`. The route loads the app and uses `systemPrompt`, `provider`, `model`, `apiKey`, and `variability`.
  - Editor test sends `system` and still uses the app row for provider, model, key, and variability.
  - `PublishedChatbot` does not cache the system prompt, so each reply can resolve the published snapshot.
- **Implications**: Keep the app row as the draft. Resolve public replies from `publishedVersionId` and `publishedApiKey`. The draft `apiKey` stays available for editor test.

### Session recording

- **Context**: Requirement 6 stores one version per new session and forbids per-message versions.
- **Sources Consulted**: `lib/chat-session-store/types.ts`, `lib/chat-session-store/store.ts` (`applyTurn`), `lib/chat-session-store/record-chat-turn.ts`, `lib/chat-session-api/transcript.ts`, `components/sessions/SessionTranscript.tsx`
- **Findings**:
  - First insert builds the record. Updates keep `createdAt` and do not change `appId` or `appName`.
  - Recording payload from the client has `sessionId`, `surface`, `ownerSharing`, and `messageTimes` only.
  - The owner transcript header already shows start time and a surface badge.
  - `anonymous_visitor_id` was added with `ADD COLUMN IF NOT EXISTS` and left null on old rows.
- **Implications**: Add nullable `configVersionId` the same way. Set it only when `existing` is null. Ignore any client-supplied version id. Show the label from the transcript API, not from a new page.

### Playlab version cadence

- **Context**: The product should follow Playlab's documented history behavior.
- **Sources Consulted**: [Playlab product changelog, 28 June 2024](https://learn.playlab.ai/changelog/Product%20Changelog), requirements.md
- **Findings**: The changelog entry "Version History v0" says history includes automatic saves every 15 minutes and versions saved each time you publish. It does not describe an extra duplicate row, change notes, or revert.
- **Implications**: Use a 15-minute coalesce window. Publishing seals the current latest version instead of inserting a second copy of the same snapshot.

### Libraries

- **Context**: Build versus adopt for diffs, ids, and migrations.
- **Sources Consulted**: `package.json`, existing `crypto.randomUUID()` call sites, steering `tech.md`
- **Findings**: No diff library and no migration framework are dependencies. Ids elsewhere use `crypto.randomUUID()`.
- **Implications**: Do not add a package. Diff the fixed snapshot fields in a pure function. Generate version ids with `crypto.randomUUID()`.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| App row is the draft, versions are history | Live tutoring fields stay on `apps`. Public chat reads the published snapshot. | Editor, peer preview, share, and fork keep reading `getAppById`. | Public chat and the public page must stop using draft prompt and name. | Selected |
| App row is the published copy, draft lives only in versions | Student reads stay on the app row. | Public chat changes less. | Every editor read and peer preview must load the latest version. Two sources for "current bot". | Rejected |
| Duplicate version row on every publish | Insert a new snapshot when the owner publishes. | Literal reading of "saved each time you publish". | Identical rows when the draft was just saved. | Rejected. Sealing the current row is the same freeze. |

## Design Decisions

### Decision: Draft stays on the app row

- **Context**: Most readers want the builder's latest saved configuration. Only student chat must stay on the published snapshot.
- **Alternatives Considered**:
  1. Move the draft exclusively into the versions table.
  2. Keep snapshotted fields on `apps` and treat that row as the latest version's cache.
- **Selected Approach**: Option 2. `publishedVersionId` on the app points at the frozen snapshot. Non-snapshotted fields stay only on the app.
- **Rationale**: Peer preview, shared projects, and the editor already read the app row. Requirement 5.3 says those project views show the latest saved configuration.
- **Trade-offs**: Public chat and the public page learn a new read path. The app row and the latest snapshot must be written together.
- **Follow-up**: Postgres uses one transaction. The JSON fallback is local-only and writes versions before apps.

### Decision: Pin a sealed copy for an editor test

- **Context**: In-place updates would change the snapshot a session already points at. Sealing the draft itself would start a new version on the next edit and break the 15-minute window during testing.
- **Alternatives Considered**:
  1. Store a full snapshot copy on every session row.
  2. Seal the draft when a session records it.
  3. When the recorded version is already sealed, stamp that id. When it is the unsealed draft, insert a sealed `session` copy and leave the draft unsealed.
- **Selected Approach**: Option 3. History list, detail, and revert include `edit` versions only.
- **Rationale**: Public and published versions are already frozen, so they need no copy. Editor tests keep a stable id without ending the coalesce window. The copy is research data, not another edit boundary.
- **Trade-offs**: A test of an unpublished draft adds a row that the history UI does not show. Repeated tests of an unchanged unsealed draft add one sealed copy each.
- **Follow-up**: Confirm an in-window edit after a test updates the same `edit` row.

### Decision: Published API key stays beside the pointer

- **Context**: Provider and model are in the snapshot. The API key is not. Public chat cannot pair the published provider with the draft key after the owner switches provider.
- **Alternatives Considered**:
  1. Put the API key inside each version snapshot.
  2. Public chat always uses the current draft key.
  3. Keep `publishedApiKey` on the app, hidden from history and from client JSON.
- **Selected Approach**: Option 3. Publish and republish copy the draft key into `publishedApiKey`. A later key change updates `publishedApiKey` only when the draft provider still equals the published snapshot provider.
- **Rationale**: Requirement 1.2 keeps keys out of version history. Same-provider key rotation still reaches live chat. A provider change waits for republish, so the live bot keeps the key that matches its published provider.
- **Trade-offs**: One extra secret column on `apps`. Key rotation for a new provider does not affect students until republish.
- **Follow-up**: Responses and logs must omit both key fields.

### Decision: Repair a missing published pointer on read

- **Context**: A published bot whose backfill did not set `publishedVersionId` still has the configuration that the initial version should contain.
- **Alternatives Considered**:
  1. Return 500 until an operator repairs the row.
  2. Serve the draft app row.
  3. Create the initial sealed version from the current app on the public read, then serve that version.
- **Selected Approach**: Option 3. A pointer that does not match a row still returns 500 and does not serve the draft.
- **Rationale**: The current row is the pre-migration published configuration. Serving it through a newly stored version keeps the published-snapshot rule. A dangling id is a different failure and must not fall back to a newer draft.
- **Trade-offs**: The first public request after a missed backfill writes a version.
- **Follow-up**: The repair is idempotent with startup backfill.

### Decision: Field diff without a library

- **Context**: Requirement 2.3 asks for changed settings and both values, not a generic text patch.
- **Alternatives Considered**:
  1. Add a JSON diff package.
  2. Compare the known snapshot leaves in a pure function.
- **Selected Approach**: Option 2.
- **Rationale**: The field list is closed. A dependency would not know builder-state leaves.
- **Trade-offs**: New snapshotted fields must be added to the diff function on purpose.
- **Follow-up**: Cover prompt, model, variability, assisted-authoring mode, and one builder leaf in the self-check.

### Decision: Previous version follows creation order

- **Context**: The list is sorted by last update, while an in-place draft bumps `updatedAt` without changing `createdAt`.
- **Alternatives Considered**:
  1. Diff against the next row in the updated-at list.
  2. Diff against the version with the next-older `createdAt`.
- **Selected Approach**: Option 2.
- **Rationale**: Creation order is the history order. Revert then diffs against the draft that was current, which is the change the owner just made.
- **Trade-offs**: The row above a version in the list is not always its diff target. The detail view must say "previous version".
- **Follow-up**: Earliest `createdAt` returns no previous version.

## Risks & Mitigations

- Draft fields and the latest snapshot diverge if a JSON write fails halfway. Production uses a Postgres transaction. Backfill only inserts a version when an app has none, so it will not mask a later mismatch. Failed saves surface an English error and do not report success.
- Public chat could leak the draft if it keeps reading `app.systemPrompt`. The chat route loads the published snapshot. A null pointer is repaired into that snapshot. A dangling version id returns 500.
- A client could send a fake version id on the recording body. The server ignores the body and stamps the id it resolved.
- Revert then an in-flight prompt debounce could write the old prompt back. The editor applies the reverted prompt to local state before autosave runs again.
- Editor tests of an unsealed draft add sealed `session` rows. Those rows are hidden from the history list, and the draft remains inside the 15-minute window.

## References

- [Playlab product changelog, 28 June 2024, Version History v0](https://learn.playlab.ai/changelog/Product%20Changelog) — 15-minute automatic saves and a version saved on publish
- `lib/app-store/store.ts` — lazy `CREATE`/`ALTER`, `updateApp`, JSON fallback
- `lib/chat-session-store/store.ts` — `applyTurn` insert versus update
- `.kiro/steering/tech.md` — no ORM, store façades, server-side secrets
