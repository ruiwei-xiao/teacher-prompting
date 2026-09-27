# Requirements Document

## Introduction

Teacher Prompting lets educators (builders) author AI tutoring bots and publish them for students. Today, saving overwrites the bot's only copy of its settings. Builders cannot see what changed or return to an earlier configuration, and researchers cannot trace how a bot was improved. Edits to a published bot also have no separate step that updates the live student experience.

This specification keeps an append-only history of the builder-editable tutoring configuration, lets the owner inspect and revert that history, and updates the student-facing bot only when the owner publishes or republishes.

Public Playlab documentation from 28 June 2024 describes automatic history saves every 15 minutes, an additional save on each publish, and a comparison between the current version and previously published versions. Current Playlab guides confirm that builder edits stay off the published app until the owner publishes again, and that a Versions area shows what changed. They do not document change notes, a field-level diff, or a revert action. This specification uses that 15-minute window for unpublished draft edits, freezes a version once it is the published one, and treats revert as a new version. It does not add change notes.

Primary users are the bot owner, who edits and publishes, and the students and researchers who depend on a stable published bot and on a record of which configuration a conversation started with.

## Boundary Context

- **In scope**:
  - An append-only history of the builder-editable tutoring configuration
  - A 15-minute window that updates the current draft in place, except when that draft is already the published version
  - Read-only inspection of each version and of its difference from the immediately previous version
  - Revert that copies an earlier version into a new latest version and does not publish it
  - First publish and later republish, with student-facing chat using only the published version
  - One recorded configuration version on each new chat session, captured at session start
  - An initial version for every bot that already exists, without changing its current tutoring behavior
- **Out of scope**:
  - Free-text change notes and auto-generated change summaries
  - A separate configuration version recorded on each message
  - Co-editing, or version history for anyone other than the owner
  - Restoring or displaying API keys, publication links, sharing settings, community listing, stars, fork credit, or editor-only test progress
  - Deleting, rewriting, or squashing past versions
  - New analytics dashboards
- **Adjacent expectations**:
  - `bot-activity-sessions` continues to own activity lists, transcripts, downloads, sharing of sessions, and My sessions. This feature records which configuration a new session started with and identifies that starting version on the existing session view. It does not replace those views.
  - The assisted-authoring publish check still gates first publish and republish when that mode requires it.
  - Student public chat remains the published bot. Editor test chat remains the owner's draft. A shared project preview shows the builder's latest saved configuration, not a second published copy.
  - Duplicating a bot copies its current configuration into a new bot with a new history. It does not copy the source bot's past versions.
  - Existing public-chat identity, recording consent, and session-deletion rules are unchanged.

## Requirements

### Requirement 1: Save tutoring configuration as versions

**Objective:** As a bot owner, I want each wave of edits kept as a configuration version, so that later work does not erase what the bot used to be.

#### Acceptance Criteria

1. The Teacher Prompting System shall store each configuration version as one snapshot of the builder-editable tutoring configuration: bot name; final system prompt, including reference text the builder has attached into that prompt; model provider, model, and response variability; whether assisted authoring is on; and stored pedagogical builder inputs, including learning objective, exercise name, exercise text, grade level, language, learner notes, template selection, and the prompt text derived from those inputs.
2. The Teacher Prompting System shall keep API keys, public links, publication state, project sharing, community listing, fork attribution, stars, and editor-only test progress outside configuration versions.
3. The Teacher Prompting System shall store a created time and a last-updated time on every configuration version.
4. When the owner changes a snapshotted setting, the latest version is not the published version, and that version was last updated no more than 15 minutes earlier, the Teacher Prompting System shall update that same version, change its last-updated time, and leave its created time unchanged.
5. When the owner changes a snapshotted setting, the latest version is not the published version, and that version was last updated more than 15 minutes earlier, the Teacher Prompting System shall create a new latest version and leave every earlier version unchanged.
6. When the owner changes a snapshotted setting and the latest version is the published version, the Teacher Prompting System shall create a new latest version regardless of how recently the published version was updated, and shall leave the published version unchanged.
7. While the owner is editing, the Teacher Prompting System shall treat the latest version as the in-progress draft.
8. If saving an edit fails, then the Teacher Prompting System shall leave existing versions unchanged and shall show an English error in the editor.

### Requirement 2: Inspect version history

**Objective:** As a bot owner, I want to read past configurations and see what changed since the previous one, so that I can understand how the bot evolved without restoring it by accident.

#### Acceptance Criteria

1. When the owner opens version history from the bot editor, the Teacher Prompting System shall list that bot's versions in English, most recently updated first, and shall show each version's last-updated date and time, whether it is the current draft, and whether it is the published version.
2. When the owner opens a version, the Teacher Prompting System shall show that version's created time, last-updated time, and snapshotted settings, and shall not make that version the draft.
3. When the owner compares a version that has an immediately previous version, the Teacher Prompting System shall show which snapshotted settings differ and shall show the earlier and later value of each changed setting.
4. When the owner compares the earliest version, the Teacher Prompting System shall show that there is no previous version to compare.
5. If someone other than the owner attempts to open version history for that bot, then the Teacher Prompting System shall deny access and shall not reveal version contents.

### Requirement 3: Revert by appending a version

**Objective:** As a bot owner, I want to return the draft to an earlier configuration without erasing history or changing the published bot, so that I can undo a direction and still see that I did so.

#### Acceptance Criteria

1. When the owner reverts to a version that is not the current draft, the Teacher Prompting System shall append a new latest version that copies the selected version's snapshot, including when the previous draft was updated no more than 15 minutes earlier.
2. When the owner reverts, the Teacher Prompting System shall leave every existing version in place.
3. When the owner reverts, the Teacher Prompting System shall not change which version is published.
4. While a version is the current draft, the Teacher Prompting System shall not offer revert for that version.
5. If revert fails, then the Teacher Prompting System shall leave history and the published version unchanged and shall show an English error.
6. If someone other than the owner attempts to revert that bot, then the Teacher Prompting System shall deny the action and shall not change history or the published version.

### Requirement 4: Publish and republish the latest version

**Objective:** As a bot owner, I want student-facing updates to happen only when I publish, so that in-progress edits stay private until I choose to release them.

#### Acceptance Criteria

1. When the owner first publishes a bot, the Teacher Prompting System shall make the latest version the published version.
2. While a bot has never been published, the Teacher Prompting System shall keep the existing first-publish action and shall not show a Republish action.
3. While the latest version is not the published version, the Teacher Prompting System shall show, in the bot editor and in English, a notice that the published bot does not include the latest edits and an action labeled Republish.
4. When the owner republishes, the Teacher Prompting System shall make the latest version the published version and shall leave every version's snapshot unchanged.
5. While the latest version is the published version, the Teacher Prompting System shall not show a Republish action.
6. Where the existing assisted-authoring publish check applies, the Teacher Prompting System shall block republish under the same conditions that block first publish and shall explain the block in English.
7. If republish or first publish fails, then the Teacher Prompting System shall leave the previously published version unchanged and shall show an English error.
8. If someone other than the owner attempts to publish or republish that bot, then the Teacher Prompting System shall deny the action and shall not change the published version.

### Requirement 5: Use the published version for students and the draft for the owner

**Objective:** As a student, I want the published bot to stay stable while the owner is editing, and as an owner, I want to try the draft before republishing.

#### Acceptance Criteria

1. When public chat generates a reply for a published bot, the Teacher Prompting System shall use the published version's configuration.
2. When editor test chat generates a reply, the Teacher Prompting System shall use the latest draft's configuration.
3. When an educator previews a shared project, the Teacher Prompting System shall show the builder's latest saved configuration.
4. While a bot has never been published, the Teacher Prompting System shall keep public chat unavailable.
5. While the owner has a draft that is not the published version, the Teacher Prompting System shall continue to answer public chat, including a chat already open, from the published version.

### Requirement 6: Record the starting configuration on new conversations

**Objective:** As a researcher, I want each new conversation tied to the configuration it started with, so that later edits do not make past use look as if it happened on today's bot.

#### Acceptance Criteria

1. When a public chat session is first recorded, the Teacher Prompting System shall associate it with the published version that served the start of that session.
2. When an editor test session is first recorded, the Teacher Prompting System shall associate it with the draft version that served the start of that session.
3. When the owner later edits, reverts, or republishes, the Teacher Prompting System shall leave that session's recorded starting version unchanged.
4. When the owner views a recorded session that has a starting version, the Teacher Prompting System shall identify that version on the existing session view as the version recorded at the start of the session.
5. The Teacher Prompting System shall not record a separate configuration version for each message.

### Requirement 7: Keep existing bots and records usable

**Objective:** As a bot owner and as a researcher, I want bots and conversations that already exist to keep working, so that versioning does not discard current tutoring behavior or past activity.

#### Acceptance Criteria

1. When configuration versions become available, the Teacher Prompting System shall give every existing bot one initial version that matches that bot's current snapshotted configuration.
2. When configuration versions become available, the Teacher Prompting System shall keep every already-published bot published on that initial version until the owner republishes.
3. The Teacher Prompting System shall keep existing recorded sessions available and shall not assign them a guessed configuration version.
4. When an educator duplicates a bot, the Teacher Prompting System shall give the new bot its own history starting from the duplicated configuration and shall not copy the source bot's past versions.
