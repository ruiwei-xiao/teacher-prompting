# Implementation Plan

## 1. Foundation: mode domain and persistence

- [x] 1.1 Add Assisted Authoring Mode resolution helper
  - Define shared mode types and a single resolver where missing/undefined mode means ON and explicit false means OFF
  - Calling the resolver with undefined, true, and false yields ON, ON, and OFF respectively
  - _Requirements: 1.4_
  - _Boundary: resolveAssistedAuthoringMode_

- [x] 1.2 Persist Assisted Authoring Mode in the app store
  - Add the optional bot field and dual-store mapping (including Postgres `ADD COLUMN IF NOT EXISTS` / JSON fallback) so stored false is OFF and absent values remain resolvable as ON
  - After store updates, create/update/read paths can carry the field without losing false, and absent legacy rows still resolve ON via 1.1
  - _Requirements: 1.2, 1.3, 1.4_
  - _Boundary: AppConfig app-store_
  - _Depends: 1.1_

- [x] 1.3 Expose Assisted Authoring Mode on apps HTTP APIs
  - New bot creation stores OFF; GET returns the stored value; PATCH accepts a boolean and rejects non-booleans; responses remain owner-scoped as today
  - POST create yields OFF; PATCH true/false round-trips on GET; invalid PATCH type does not silently coerce
  - _Requirements: 1.2, 1.3, 1.6_
  - _Boundary: AppConfig + apps API_
  - _Depends: 1.2_

- [x] 1.4 Copy Assisted Authoring Mode on fork/duplicate
  - When forking/duplicating a bot, copy the source stored mode when present; if the source has no stored value, the fork behaves as ON under the resolver
  - Forking an OFF bot yields an OFF bot; forking a legacy ON-resolved bot remains ON after resolve
  - _Requirements: 1.2, 1.4_
  - _Boundary: AppConfig app-store_
  - _Depends: 1.2_

## 2. Core: settings UI and client snapshot

- [x] 2.1 (P) Add Assisted Authoring Mode control in bot Settings
  - Show a clear ON/OFF control in bot Settings with short help text; load current stored/resolved mode; save through the apps PATCH path; on save failure show an error and do not leave the UI implying success
  - Settings shows and persists the mode; failed saves surface an error without silently applying the new mode
  - _Requirements: 1.1, 1.2, 1.6_
  - _Boundary: AppSettingsDialog_
  - _Depends: 1.3_

- [ ] 2.2 (P) Build client snapshot for preserved test cases
  - Implement app-scoped client snapshot save/read/clear, Final Prompt fingerprinting aligned with editor prompt resolution, and OFF→ON planning that restores when fingerprints match and regenerates when they differ or the snapshot is missing
  - Matching fingerprints plan restore; mismatch or missing snapshot plans regenerate; clear removes that bot’s snapshot
  - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.5_
  - _Boundary: AssistedAuthoringSnapshotStore_
  - _Depends: 1.1_

## 3. Integration: editor gating and transitions

- [ ] 3.1 Wire mode-aware publish gating in the editor
  - Load resolved mode in the editor page; while ON keep the all-pass test case publish gate and messages; while OFF skip that gate; keep Final Prompt editing available
  - With mode OFF, publish is not blocked for missing/unpassed test cases; with mode ON, the existing all-pass gate still blocks
  - _Requirements: 2.3, 2.4, 3.4, 3.5, 5.1_
  - _Boundary: EditorPublishGate_
  - _Depends: 1.1, 1.3_

- [ ] 3.2 Hide the test-case rail while mode is OFF
  - While OFF, hide or collapse the editor test-case rail/panel host so preserved cases are not visible; while ON show the rail as today
  - OFF editor layout does not display the test-case panel; switching back to ON restores panel visibility for subsequent panel content wiring
  - _Requirements: 3.3_
  - _Boundary: EditorChrome, AssistantPanelModeGate_
  - _Depends: 3.1_

- [ ] 3.3 Gate AssistantPanel auto-generation and prompt revision by mode
  - While ON keep auto-generation and bubble-edit prompt revision available; while OFF disable auto-generation and do not offer/apply prompt revision from AI response edits
  - OFF offers no auto-generate path and no Update-prompt-from-edits path; ON retains current assisted entry points
  - _Requirements: 2.1, 2.2, 3.1, 3.2_
  - _Boundary: AssistantPanelModeGate_
  - _Depends: 3.1_

- [ ] 3.4 Handle ON→OFF transition with snapshot preserve
  - When mode changes from ON to OFF, write a client snapshot of current test cases plus Final Prompt fingerprint, then hide cases rather than deleting them; if snapshot write fails, show an error and do not claim preservation succeeded or treat the hide/preserve transition as complete
  - After a successful ON→OFF, cases are not visible and a snapshot exists for later restore/regenerate planning
  - _Requirements: 3.3, 4.1, 4.5_
  - _Boundary: AssistantPanelModeGate_
  - _Depends: 2.2, 3.2, 3.3_

- [ ] 3.5 Handle OFF→ON restore or regenerate
  - When mode changes from OFF to ON, use the snapshot plan: restore when fingerprints match; regenerate when they differ or snapshot is missing; on regenerate failure show an error, keep mode ON, and do not present stale preserved cases as current
  - Unchanged Final Prompt restores prior cases; changed prompt regenerates; failed regen shows error without stale cases
  - _Requirements: 4.2, 4.3, 4.4_
  - _Boundary: AssistantPanelModeGate_
  - _Depends: 3.4_

- [ ] 3.6 Adapt editor spotlight guidance for OFF mode
  - While OFF, skip or mark non-mandatory any onboarding/spotlight steps that require test cases or all-pass publish
  - Opening the editor with mode OFF does not force assisted-only spotlight steps as mandatory
  - _Requirements: 5.1, 5.2_
  - _Boundary: SpotlightModeAdapt_
  - _Depends: 3.1, 3.2_

## 4. Validation

- [ ] 4.1 (P) Add mode resolver selftests
  - Runnable checks that undefined/true/false resolve to ON/ON/OFF
  - Resolver selftests pass
  - _Requirements: 1.4_
  - _Boundary: resolveAssistedAuthoringMode_
  - _Depends: 1.1_

- [ ] 4.2 (P) Add snapshot planning selftests
  - Runnable checks for restore vs regenerate planning including missing-snapshot behavior
  - Snapshot planning selftests pass
  - _Requirements: 4.2, 4.3, 4.5_
  - _Boundary: AssistedAuthoringSnapshotStore_
  - _Depends: 2.2_

- [ ]* 4.3 Manual E2E checklist for Assisted Authoring Mode
  - Optional deferred checklist covering: new bot defaults OFF; legacy/ON assisted path; ON→OFF hide+preserve; OFF→ON restore; OFF→ON regenerate after prompt change; regen failure; publish gating ON vs OFF; Settings save error; Create a new App has no mode control
  - Checklist document exists for post-MVP manual run and explicitly includes Create-page exclusion
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 3.1, 3.4, 4.1, 4.2, 4.3, 4.4_

## Implementation Notes
- Selftests: run with `npx tsx <path>` (requires non-sandbox / full permissions in this environment).
- Store mapping for booleans: follow `shareAuthorName` — preserve `false` vs `undefined` (`?? undefined` on read, do not coerce missing to false).
