# Implementation Plan

## 1. Foundation: version decisions and storage

- [ ] 1. Foundation: version decisions and storage
- [x] 1.1 Decide when a draft version is updated or replaced
  - A configuration snapshot includes the bot name, final system prompt with attached reference text, provider, model, variability, assisted-authoring mode, and stored pedagogical builder inputs
  - A snapshot excludes API keys, public links, publication state, sharing, community listing, fork credit, stars, and editor-only test progress
  - An unsealed draft last updated no more than 15 minutes ago, including exactly 15 minutes, is updated in place and keeps its created time
  - An unsealed draft last updated more than 15 minutes ago, a missing draft, or a sealed latest version causes a new version
  - Comparing two snapshots lists only changed settings with the earlier and later value
  - The version-rules self-check passes for the exact 15-minute boundary, a sealed latest version, a prompt change, a model change, and the excluded secret fields
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 2.3_

- [x] 1.2 Store configuration versions and backfill existing bots
  - Every new version stores a created time and a last-updated time
  - Backfill runs when version storage is prepared; each existing bot with no versions receives one edit version copied from its current snapshotted settings
  - An already published bot points at that initial version, the version is sealed, and the published API key is copied from the current key
  - An unpublished bot keeps an empty published pointer and an empty published API key
  - A later repair read for a published bot with an empty pointer and no versions creates one sealed edit version from the current settings, points at it, and copies the current API key into the published API key
  - If that bot already has versions, the repair does not insert another; it seals the earliest edit version without changing its snapshot, points the published pointer at that version, and copies the current API key into the published API key
  - Running backfill or repair twice does not add a second initial version
  - Existing chat sessions are not assigned a version during backfill
  - _Requirements: 1.3, 7.1, 7.2, 7.3_
  - _Depends: 1.1_

- [x] 1.3 Keep the app row as the current draft
  - Creating a bot also creates one unsealed edit version, and the app row matches it
  - Saving a snapshotted setting updates that unsealed draft or appends a new edit version
  - Appending a new edit version seals the previous edit version, so only one edit version stays unsealed
  - The app row then matches that unsealed draft; a session copy never becomes the draft
  - Saving a non-snapshotted setting does not create a version
  - Duplicating a bot copies the current tutoring configuration into a new bot with one new version and does not copy the source history
  - Peer project preview and shared project pages still read the app row
  - A failed save leaves existing versions and the previous app row unchanged
  - _Requirements: 1.7, 1.8, 5.3, 7.4_
  - _Depends: 1.2_

## 2. Core: publish, session pins, and history access

- [ ] 2. Core: publish, session pins, and history access
- [x] 2.1 Publish the latest draft and keep a separate published API key
  - When one save both changes snapshotted settings and publishes, the draft version is synced first and that latest edit version is then sealed and published
  - First publish makes the latest edit version the published version, seals that version, copies the draft API key into the published API key, and does not change the snapshot
  - Republish moves the pointer to the latest edit version and copies the draft API key, without changing any version snapshot
  - Publishing again when the pointer already matches leaves the pointer, the published key, and every version unchanged
  - Changing the API key while the draft provider still matches the published provider updates the published API key immediately
  - Changing the provider so it differs from the published snapshot leaves the published API key unchanged
  - A failed publish leaves the previous published version in place
  - _Requirements: 1.2, 1.6, 4.1, 4.4, 4.7_
  - _Depends: 1.3_
  - _Boundary: App store sync_

- [ ] 2.2 Pin a sealed copy for an editor test of an open draft
  - Pinning an unsealed draft inserts one sealed session copy and leaves the draft unsealed and editable
  - Pinning an already sealed version returns that same version id and does not insert a copy
  - The session copy is not the current draft
  - _Requirements: 6.2, 6.3_
  - _Depends: 1.2_
  - _Boundary: Version store_

- [ ] 2.3 Record the starting version on a new conversation
  - A new session stores the server-supplied starting version id once
  - Later turns do not change that id
  - Messages do not store a version id
  - Sessions that already exist stay without a version id
  - A version id on the client recording body is ignored
  - _Requirements: 6.1, 6.2, 6.3, 6.5, 7.3_
  - _Depends: 2.2_
  - _Boundary: Session stamp_

- [ ] 2.4 (P) Let the owner read version history
  - The owner can list edit versions newest-updated first, with last-updated time, whether each is the current draft, and whether it is published
  - The list does not include prompt text, pedagogical builder inputs, or session copies
  - Opening an edit version shows its created time, last-updated time, and snapshotted settings without making it the draft
  - The comparison shows changed settings against the previous edit version
  - The earliest edit version shows that there is no previous version
  - A session-copy id returns not found with no snapshot body
  - Someone other than the owner receives not found and no version contents
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Depends: 1.2_
  - _Boundary: Version routes_

## 3. Integration: revert, chat, and the editor

- [ ] 3. Integration: revert, chat, and the editor
- [ ] 3.1 (P) Revert by appending a draft
  - Reverting an edit version that is not the current draft appends a new edit version with that snapshot, even inside the 15-minute window, and leaves every older version in place
  - The app row then matches that new draft
  - Revert does not change the published pointer or the published API key
  - Reverting the current draft or a session copy is rejected in English and changes nothing
  - A failed revert leaves history, the app row, and the published version unchanged
  - Someone other than the owner cannot revert
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Depends: 1.3, 2.1, 2.2, 2.4_
  - _Boundary: Version store, Version routes, App store sync_

- [ ] 3.2 (P) Serve students the published snapshot and the owner the draft
  - Public chat replies and the public page title use the published version's name, prompt, provider, model, and variability, together with the published API key
  - A published bot with an empty pointer uses the repair result from version storage and this task does not insert a version itself
  - A published pointer that does not match a version row returns an English error and does not use the draft
  - An unpublished bot stays unavailable on public chat
  - New public sessions record the published version id
  - Editor test replies use the system prompt supplied by the editor plus the saved draft's provider, model, variability, and draft API key
  - New editor-test sessions record the pinned version id
  - After republish, the next public reply, including a chat already open, uses the newly published version
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.2_
  - _Depends: 2.1, 2.2, 2.3_
  - _Boundary: Chat resolution_

- [ ] 3.3 (P) Show the starting version on an existing session
  - When the owner opens a recorded session that has a starting version, the existing session view shows that it is the version recorded at the start, using the version's created time
  - A session with no starting version shows no version label
  - A starting version id that no longer resolves shows that the bot version is unavailable, without inventing a time
  - Activity downloads are unchanged
  - _Requirements: 6.4, 7.3_
  - _Depends: 2.3_
  - _Boundary: Transcript label_

- [ ] 3.4 (P) Return version ids from the app settings endpoint
  - Reading and saving a bot returns the latest edit version id and the published version id
  - Neither API key is included in the response
  - Someone other than the owner who publishes or republishes receives the same not-found response as a missing bot, and the published pointer stays unchanged
  - A failed publish returns an English error and leaves the previous pointer in place
  - _Requirements: 4.7, 4.8_
  - _Depends: 2.1_
  - _Boundary: App PATCH_

- [ ] 3.5 Show Publish or Republish from the editor
  - A bot that has never been published keeps the existing Publish action and does not show Republish
  - When the latest edit version differs from the published version, the editor shows the English notice "You have unpublished changes." and an action labeled Republish
  - When those versions match, the editor shows a Published status and does not show Publish or Republish
  - Both actions still use the existing assisted-authoring publish check and its English explanation
  - A failed save, publish, or republish shows the English error and leaves the previous published version and unsaved editor state in place
  - _Requirements: 1.8, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8_
  - _Depends: 3.4_
  - _Boundary: Editor history_

- [ ] 3.6 Open history, compare versions, and revert from the editor
  - History opens from the bot editor and lists the same edit versions as the owner history endpoint, including draft and published badges
  - Selecting a version shows its settings and the previous-version comparison without replacing the draft
  - The earliest version shows that there is no previous version
  - Revert is not offered for the current draft
  - A successful revert makes the appended version the current draft, updates the editor name, model, variability, assisted-authoring mode, and prompt before another prompt save can run, and does not offer revert on that new draft
  - The published status follows the same rule as the publish controls
  - A failed revert shows the English error and leaves the published bot and the editor draft unchanged
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.4, 3.5_
  - _Depends: 2.4, 3.1, 3.5_
  - _Boundary: Editor history_

## 4. Validation

- [ ] 4. Validation
- [ ] 4.1 Verify stored version behavior
  - A self-check creates a bot with one version and an empty pointer
  - An in-window save updates that version and keeps its created time; a later pin of that draft leaves it unsealed
  - Publish then edit leaves the published snapshot unchanged
  - Revert appends a version, matches the app row to the new draft, and leaves the published pointer unchanged
  - Duplicating a bot with several versions yields one version on the new bot
  - A second turn on a session does not change its starting version
  - A same-provider API key change updates the published key, and a provider change does not
  - A published bot with an empty pointer and no versions receives one version on repair, and that snapshot matches the bot
  - The self-check passes via npx tsx
  - _Requirements: 1.3, 1.4, 1.6, 1.7, 3.1, 3.2, 3.3, 4.4, 5.1, 6.3, 6.5, 7.1, 7.2, 7.4_
  - _Depends: 3.1, 3.2_

## Implementation Notes

- Builder-leaf diff fields are `builderState.<leaf>`. Null variability displays as `unset`. `npx tsx` self-checks need to run outside the sandbox (`EPERM` on the tsx IPC pipe).
- JSON backfill must not call `listApps` or `getAppById` while `prepareConfigVersionStore` is still pending, or the JSON load deadlocks. `listConfigVersions` returns full records and is not the history summary API.
- JSON self-checks share `.data/*.json`. Run them sequentially. `APP_DRAFT_SAVE_FAULT=1` is a one-shot test switch that throws after the version write so a failed save can be proven to restore both files. `APP_PUBLISH_FAULT=1` is the same kind of switch for a failed publish after the seal. A republish whose pointer already matches does not copy a new API key.
