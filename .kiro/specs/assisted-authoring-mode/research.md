# Research & Design Decisions: assisted-authoring-mode

## Summary
- **Feature**: assisted-authoring-mode
- **Discovery Scope**: Extension (existing editor + app settings + publish gate)
- **Key Findings**:
  - Assisted behaviors today are always on: test case auto-generation and bubble-edit → prompt revision live mainly in `AssistantPanel`; publish all-pass gate lives in `app/app/[appId]/editor/page.tsx`.
  - Test cases are React state (not server-persisted). Final Prompt resolution prefers in-editor text → `lib/prompt-storage/client.ts` localStorage → `AppConfig.systemPrompt`.
  - Bot Settings already PATCHes booleans via `AppSettingsDialog` + `/api/apps/[appId]`; `shareAuthorName` is the closest persistence pattern. Legacy columns use `ADD COLUMN IF NOT EXISTS` with `rowToApp` defaults.

## Research Log

### Extension points for mode persistence
- **Context**: Need a per-bot ON/OFF that survives sessions and defaults differently for new vs existing bots.
- **Sources Consulted**: `lib/app-store/types.ts`, `lib/app-store/store.ts`, `app/api/apps/route.ts`, `app/api/apps/[appId]/route.ts`, `components/editor/AppSettingsDialog.tsx`
- **Findings**:
  - `AppConfig` is the natural home for bot-scoped settings.
  - Create path: `POST /api/apps` → `createApp`.
  - PATCH accepts explicit booleans (e.g. `shareAuthorName`).
  - Missing optional fields are defaulted in `rowToApp` / API responses (`?? false` / `|| "private"`).
- **Implications**: Add `assistedAuthoringMode?: boolean`. Resolve reads as `assistedAuthoringMode ?? true` so legacy rows without the field behave as ON. New creates write `false`.

### Test case lifetime and preservation
- **Context**: Requirements require hide-and-preserve on OFF and restore/regenerate on ON.
- **Sources Consulted**: `components/editor/AssistantPanel.tsx` (TestCaseSet state), codebase search for test-case persistence
- **Findings**:
  - Test cases are in-memory `useState` initialized via `createInitialTestCases` / generation APIs.
  - There is no server test-case store today.
  - Final Prompt fingerprinting can use the same resolved prompt string the editor already uses (`resolveAssistantSystemPrompt` pattern + `readStoredPrompt`).
- **Implications**: Do not invent server-side test-case persistence for this feature. Persist an **editor-local snapshot** (scoped localStorage, same device class as prompt storage) containing serialized test cases + prompt fingerprint at OFF time. Cross-device restore of hidden test cases is out of boundary (matches current test-case ephemerality across devices).

### Bubble-edit → prompt revision and publish gate
- **Context**: OFF must disable these without rewriting evaluation systems.
- **Sources Consulted**: `AssistantPanel` `runPromptUpdatePipeline`, `app/api/prompt-builder/chat-feedback/route.ts`, `app/app/[appId]/editor/page.tsx` `handlePublish`
- **Findings**:
  - Prompt revision is client-initiated; gating UI/pipeline entry is sufficient for OFF.
  - Publish gate is a client check on `testCaseStatus.allPassed` before PATCH `publish: true`.
- **Implications**: Thread resolved mode into editor page + AssistantPanel; skip gate when OFF; hide Update-prompt / auto-generate paths when OFF. Server publish route need not re-implement the all-pass gate (it does not today).

### Create page and onboarding
- **Context**: Requirements forbid Create-page toggle; OFF must not force assisted tour steps.
- **Sources Consulted**: Create app flow (no mode UI), `editorSpotlightTourSteps.tsx`
- **Findings**: Create flow only sets name/model-style fields. Spotlight steps assume test cases and all-pass publish.
- **Implications**: Leave Create UI unchanged. Adapt spotlight / mandatory assisted steps when mode is OFF.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. AppConfig boolean + client snapshot | Persist mode on app; snapshot test cases + prompt fingerprint in scoped client storage | Matches existing settings + prompt-storage patterns; small surface | Snapshot not cross-device | Selected |
| B. Server-persisted test cases | Move TestCaseSet to Postgres/JSON with mode | True cross-device restore | Large new domain; out of scope | Rejected for this spec |
| C. Mode-only flag, no snapshot | Hide panel; lose test cases on OFF | Simplest | Violates preserve/restore requirements | Rejected |

## Synthesis Outcomes

- **Generalization**: One resolved mode boolean gates three existing assisted behaviors; avoid separate flags per behavior.
- **Build vs adopt**: Adopt existing AppConfig + Settings PATCH + prompt-storage patterns; no new libraries or server test-case domain.
- **Simplification**: Client snapshot for preserve/restore only; do not migrate test cases to Postgres in this spec.

## Design Decisions

### Decision: Optional boolean with legacy-ON default
- **Context**: New bots OFF; existing bots ON without a backfill migration job.
- **Alternatives Considered**:
  1. DB DEFAULT true for all rows, override creates to false — works but couples migration to insert paths carefully.
  2. Enum `on|off` — unnecessary.
  3. Optional boolean + `?? true` read resolver — explicit create writes `false`.
- **Selected Approach**: `assistedAuthoringMode?: boolean` with `resolveAssistedAuthoringMode(app) => app.assistedAuthoringMode ?? true`. Creates set `false`.
- **Rationale**: Matches `shareAuthorName`-style evolution; no mass UPDATE required for legacy ON.
- **Trade-offs**: Call sites must use the resolver, never raw `=== true`.
- **Follow-up**: Ensure fork/duplicate copies the stored field when present; new blank creates stay `false`.

### Decision: Client-scoped test-case snapshot for OFF preservation
- **Context**: Test cases are not server data today.
- **Alternatives Considered**: Server JSON blob on AppConfig; in-memory only for the session.
- **Selected Approach**: `lib/assisted-authoring/` client module stores `{ promptFingerprint, testCases, savedAt }` keyed by `appId` when transitioning ON→OFF (and updates fingerprint association while ON as needed for comparison).
- **Rationale**: Satisfies hide/preserve/restore without a new persistence domain; aligns with Final Prompt localStorage.
- **Trade-offs**: Restore is same-browser/device; acceptable and documented as adjacent to current test-case lifetime.
- **Follow-up**: Normalize fingerprint string (trim) consistently with Final Prompt resolution order.

### Decision: Gate behaviors in editor UI, not a new evaluation service
- **Context**: Three assisted behaviors already exist.
- **Selected Approach**: Single mode signal into Settings, editor shell, AssistantPanel, publish handler, spotlight.
- **Rationale**: Requirements ask to gate existing behavior, not redesign evaluation.
- **Trade-offs**: Must audit all auto-generate entry points in AssistantPanel/InstructionDoc.

## Risks & Mitigations
- Missed auto-generate entry point while OFF — Audit generation triggers; centralize `isAssistedAuthoringEnabled` checks.
- Stale test cases shown after prompt change — Compare fingerprint before restore; on mismatch regenerate and do not show stale set (req 4.4).
- Legacy default mistakes (`?? false` accidentally) — Unit-test resolver; document in design contracts.
- Spotlight still blocks OFF users — Skip or soften assisted-only steps when mode is OFF.

## References
- Internal: `lib/app-store/types.ts`, `lib/prompt-storage/client.ts`, `components/editor/AppSettingsDialog.tsx`, `components/editor/AssistantPanel.tsx`, `app/app/[appId]/editor/page.tsx`
- Steering: `.kiro/steering/tech.md`, `.kiro/steering/structure.md`
