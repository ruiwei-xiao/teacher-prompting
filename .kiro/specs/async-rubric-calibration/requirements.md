# Requirements Document

## Introduction

Teacher Prompting helps educators author and publish AI tutoring bots, and learners already use published chats. It does not yet support a multi-day, multi-person calibration activity. This specification adds an **async-only Rubric Calibration Space**: a persistent team room where three signed-in learners are matched course-wide, build and revise a shared rubric, score a shared artifact blindly, discuss disagreements, and leave with a final team rubric — without anyone needing to be online at the same time.

The original 35-minute live session is not a format this feature supports. Institution cohorts used for monthly coach check-ins are not the same grouping as these teams. Educators prepare the sample bot and deployment package in the existing Solo editor; learners work in the activity space, not in the bot editor.

## Boundary Context

- **In scope**:
  - Operator-configured Rubric Calibration offerings (course gate / tool link, attached artifacts)
  - Course-wide matching into teams of 3 (not institution-bound)
  - Persistent team spaces that stay available across days to weeks
  - Dual timeout clocks (per-person and group) with absence, nudge, and auto-finalize behavior
  - Critique rounds with rotating Presenter and Critics
  - Shared rubric document and shared notes with simultaneous-presence cursors
  - Independent blind scoring with gated reveal
  - Rule-based disagreement detection (≥2-point spread)
  - Facilitator messages in the group chat, including recap, turn prompts, revoicing, document-aware comments, and targeted disagreement questions
  - Read-only view of the sample bot system prompt, deployment brief, transcript excerpt, and try-chat
  - Offline-reaching notices (including the learner’s account email) for matching, turns, nudges, reveal, and finalization
  - Operator dashboard covering stuck-queue learners with manual matching, plus per-team progress and full read access to team contents
  - Late-return join-at-current-phase rules and post-finalization personal addenda
- **Out of scope**:
  - A synchronous 35-minute live session or any “everyone must be online now” mode
  - Embedding or operating Bazaar / ClimateChangeAgent as an external live room
  - A fallback path for a learner who never reaches quorum even after operator manual matching (flagged for a later decision)
  - Making learners into educator Workspace members, or replacing Publish / student chat / project share / Community
  - Shared edit rights on another educator’s bot or on the sample bot’s system prompt
  - Organization / institution hierarchy, Collections, or Workspace activity analytics
  - Using institution coach-check-in cohorts as this activity’s teams
- **Adjacent expectations**:
  - Educators continue to create and edit the sample bot in the existing owner-only Solo editor and publish a student chat as they do today
  - Learners who try the sample chatbot use the existing published-chat experience without gaining editor access
  - Educator Workspaces remain educator-only membership spaces; this activity’s teams and queue are a separate grouping
  - Authentication and account email already exist; this feature requires signed-in learners and uses that identity for matching, presence, and notices
  - Existing Workspace email invites still do not send mail today; activity notices in this feature are a new learner-visible obligation and do not redefine Workspace invite behavior

## Requirements

### Requirement 1: Activity offering and course gate

**Objective:** As a course operator, I want to open a Rubric Calibration offering with a fixed deployment package, so that learners enter one shared activity instead of a bot editor.

#### Acceptance Criteria

1. When a signed-in operator configures a Rubric Calibration offering, the Teacher Prompting System shall attach a sample bot, a sample rubric to critique, a deployment brief, and a transcript excerpt as the offering’s artifacts.
2. When a signed-in learner follows the offering’s course-gate link and chooses to enter the Rubric Calibration Space, the Teacher Prompting System shall register that learner’s check-in for that offering.
3. When a learner opens the activity space, the Teacher Prompting System shall present the attached artifacts without opening the Solo bot editor.
4. The Teacher Prompting System shall treat matching for an offering as course-wide for that offering and shall not form activity teams from institution coach-check-in cohorts.

### Requirement 2: Course-wide matching queue

**Objective:** As a learner, I want to wait in a visible queue until two other course learners join, so that I get a team of three without scheduling a live meeting.

#### Acceptance Criteria

1. When a learner checks in and fewer than three unmatched checked-in learners are available for that offering, the Teacher Prompting System shall keep the learner in a pre-quorum queue and show queue status that includes how many of three have checked in.
2. When a third unmatched checked-in learner joins the same offering, the Teacher Prompting System shall form a team of exactly three, create a persistent team space, and take those three out of the queue.
3. While a learner is waiting in the queue, the Teacher Prompting System shall send a re-confirmation notice every 5 to 7 days asking whether they are still interested.
4. If a waiting learner misses two consecutive re-confirmation notices, the Teacher Prompting System shall expire that check-in and notify the learner that they are no longer in the queue.
5. If a learner has waited 10 to 14 days in the queue without a team forming, the Teacher Prompting System shall surface that learner on an operator dashboard for manual matching.
6. When an operator manually matches waiting learners into a valid team of three, the Teacher Prompting System shall form the team space the same way as automatic quorum.
7. If a learner never reaches a team even after operator manual matching, the Teacher Prompting System shall not invent an alternate solo or pair completion path in this version.

### Requirement 3: Persistent async team space

**Objective:** As a learner, I want the team space to keep our chat, documents, and progress while we come and go, so that the activity can run across days without a live sitting.

#### Acceptance Criteria

1. When a team is formed, the Teacher Prompting System shall keep that team’s space available until the activity is finalized, including across days and weeks with no one present.
2. When a team member returns to the space, the Teacher Prompting System shall show the current phase, accumulated chat, shared documents, and a recap of what happened since they last participated.
3. The Teacher Prompting System shall not require all three learners to be present at the same time to advance a phase.
4. The Teacher Prompting System shall not offer a timed 35-minute live session as an activity mode.

### Requirement 4: Independent timeout clocks

**Objective:** As a learner, I want silence to move the activity forward without punishing the whole team for one person’s delay, so that we can finish asynchronously.

#### Acceptance Criteria

1. The Teacher Prompting System shall run a per-person clock and a group clock as two independent timers that are never merged into one.
2. When a phase or round that waits on an individual begins, the Teacher Prompting System shall start or reset that person’s per-person clock for that step only.
3. When any team member posts a message or edits a shared document, the Teacher Prompting System shall reset the group clock and shall not reset another member’s per-person clock because of that activity.
4. If a learner’s per-person clock expires, the Teacher Prompting System shall mark that learner absent for the current step only and shall continue the step with the remaining present members.
5. If the group clock expires in a phase that allows auto-finalization, the Teacher Prompting System shall auto-finalize that phase with the work collected so far and shall label incomplete or unresolved parts as such.
6. While a learner is marked absent for a step, the Teacher Prompting System shall still allow them to rejoin later steps of the same team space.

### Requirement 5: Quorum kickoff and re-orientation

**Objective:** As a learner who may have waited days, I want a clear kickoff recap when the team forms, so that I know the purpose and the next action.

#### Acceptance Criteria

1. When a team of three is formed, the Teacher Prompting System shall notify all three members through their account email that the group has formed and the space is ready.
2. When the team is formed, the Teacher Prompting System shall post a recap in the team space that states the activity purpose and what happens next.
3. If a member does not respond to the kickoff, the Teacher Prompting System shall apply the critique-round per-person clock rather than blocking team formation.

### Requirement 6: Rotating critique rounds

**Objective:** As a learner, I want each of us to present an individual critique once and critique twice, so that every voice shapes the later shared rubric.

#### Acceptance Criteria

1. When kickoff is complete, the Teacher Prompting System shall run exactly three critique rounds in the team space.
2. When a critique round starts, the Teacher Prompting System shall assign one Presenter and two Critics, announce the current Presenter, and prompt the Presenter to share their individual critique of the sample rubric.
3. When the Presenter has shared a critique, the Teacher Prompting System shall prompt the two Critics to respond with agree or disagree plus reasoning.
4. When a round’s required responses are in, or when remaining present members have satisfied the round after per-person timeouts, the Teacher Prompting System shall revoice each critique in the group chat and rotate so a different member is Presenter next.
5. The Teacher Prompting System shall finish role rotation only after each of the three members has been Presenter once and Critic twice, counting a skipped turn as absent rather than reassigning past rounds.
6. If a Presenter or Critic’s per-person clock reaches 48 hours with no response, the Teacher Prompting System shall mark that person absent for that round only and shall continue the round with the remaining two members.
7. When a member marked absent in a critique round returns before a later phase has finished, the Teacher Prompting System shall let them participate from the team’s current point and shall not replay or undo completed rounds.

### Requirement 7: Shared rubric, notes, and live cursors

**Objective:** As a team, I want one shared rubric document we can edit together, with visible cursors when we overlap, so that we can merge critiques into 3–4 criteria.

#### Acceptance Criteria

1. When the third critique round is complete, the Teacher Prompting System shall open a shared rubric document in the team space and prompt the team to synthesize 3 to 4 criteria, each with a one-line rationale.
2. When two or more present members have the shared rubric document open at the same time, the Teacher Prompting System shall show each other member’s cursor, selection, and identity on that document in real time.
3. When a member edits the shared rubric document, the Teacher Prompting System shall show the updated content to other members who have the document open without requiring a full page reload.
4. The Teacher Prompting System shall provide a shared notes document in the team space that the same members can edit, with the same simultaneous-presence cursor behavior as the shared rubric.
5. The Teacher Prompting System shall not show collaborative cursors on the sample bot system prompt, the deployment brief, the transcript excerpt, private score sheets, or the group chat composer.
6. If a member makes no contribution to the shared rubric for 3 days during the merge phase, the Teacher Prompting System shall nudge that member and then continue the merge with remaining input.
7. If 14 days pass with no edit or message from anyone during the merge phase, the Teacher Prompting System shall auto-finalize the shared rubric with whatever criteria exist and shall flag the rubric as incomplete.

### Requirement 8: Blind scoring and gated reveal

**Objective:** As a learner, I want to score the shared artifact privately and see everyone’s scores only after present members have submitted, so that my score is not anchored by teammates.

#### Acceptance Criteria

1. When the shared rubric is finalized, the Teacher Prompting System shall ask each present member to score the same attached artifact (deployment brief plus transcript excerpt, with try-chat available) against the team’s own rubric.
2. While a member’s scores are not yet revealed, the Teacher Prompting System shall hide those scores from every other member and from the group chat.
3. When a member submits scores, the Teacher Prompting System shall acknowledge the submission to the team without revealing the numeric values.
4. When every present member has submitted, the Teacher Prompting System shall reveal all held scores to the team at the same time.
5. If a member’s per-person scoring clock reaches 7 days with no submission, the Teacher Prompting System shall mark that member absent for scoring and shall reveal the scores of the members who did submit.
6. If exactly two present members have submitted when reveal proceeds, the Teacher Prompting System shall still reveal those two score sets and shall treat two scorers as sufficient to continue.
7. The Teacher Prompting System shall accept an integer score from 1 to 5 per rubric criterion so that a later spread of two or more points can be computed.

### Requirement 9: Disagreement detection and discussion

**Objective:** As a learner, I want the system to flag large score gaps and ask us for evidence, so that we calibrate criteria instead of averaging in silence.

#### Acceptance Criteria

1. When gated reveal completes, the Teacher Prompting System shall compute, for each criterion, the difference between the highest and lowest revealed scores.
2. When a criterion’s score spread is two or more points, the Teacher Prompting System shall flag that criterion for discussion.
3. When one or more criteria are flagged, the Teacher Prompting System shall start a discussion phase and shall post a targeted prompt that names a scorer and asks what in the artifact led to their score.
4. When a flagged-criterion exchange is underway, the Teacher Prompting System shall revoice stated evidence in the group chat and shall ask the other party whether their reading changes.
5. If a member does not respond to a targeted discussion prompt for 7 days, the Teacher Prompting System shall mark that member absent for that exchange and shall continue with remaining members.
6. If 14 days pass with no message from anyone during discussion, the Teacher Prompting System shall auto-finalize the discussion with unresolved criteria labeled as unresolved.
7. If no criterion has a spread of two or more points, the Teacher Prompting System shall skip discussion and move the team to the final-deliverable phase.

### Requirement 10: Consensus, final deliverable, and late return

**Objective:** As a team, I want a locked final rubric plus a way to return late without undoing others’ work, so that the activity always ends with a visible deliverable.

#### Acceptance Criteria

1. When discussion ends, or when no criteria were flagged, the Teacher Prompting System shall prompt present members to rewrite criteria that produced disagreement and to confirm the final rubric together.
2. When all present members explicitly agree the rubric is final, the Teacher Prompting System shall lock the group rubric as the final deliverable.
3. If the group-level 14-day silence clock expires before explicit consensus, the Teacher Prompting System shall auto-synthesize a best-available final deliverable from the existing rubric and discussion, lock it, and label which criteria were never resolved.
4. After the group artifact is locked, the Teacher Prompting System shall reject further edits to that group rubric.
5. When a member who was marked absent returns before the group artifact is locked, the Teacher Prompting System shall place them at the team’s current phase and shall not roll the team back.
6. When a member returns after the group artifact is locked, the Teacher Prompting System shall let them view the final deliverable and add a personal addendum, and shall keep the locked group artifact unchanged.

### Requirement 11: Facilitator in the group chat

**Objective:** As a learner, I want a facilitator in the team chat that keeps the activity moving and can see our shared documents, so that we are not facilitating the process ourselves.

#### Acceptance Criteria

1. When a team space exists, the Teacher Prompting System shall include a facilitator participant in the group chat that is distinct from the three learners.
2. When a phase starts, a role rotates, a timeout fires, or scores are revealed, the Teacher Prompting System shall have the facilitator post the corresponding scripted announcement or prompt in the group chat.
3. When learners post critiques or disagreement explanations, the Teacher Prompting System shall have the facilitator revoice or ask a follow-up in natural language without using that language generation to decide whether a phase may advance.
4. When the shared rubric or shared notes change during a document-aware phase, the Teacher Prompting System shall allow the facilitator to read the current document text and comment in the group chat, including flagging vague or unmeasurable criteria and missing rationales.
5. The Teacher Prompting System shall advance phases from check-ins, submissions, role completion, numeric score spread, explicit agreement, and timeout rules, not from the facilitator’s generated wording alone.

### Requirement 12: Read-only sample prompt and try-chat

**Objective:** As a learner, I want to read the sample bot’s system prompt and try the bot, without being able to change it, so that we judge a stable artifact.

#### Acceptance Criteria

1. When a learner is in the team space, the Teacher Prompting System shall show the sample bot’s system prompt as readable text.
2. While a learner is in the team space, the Teacher Prompting System shall prevent that learner from editing the sample bot’s system prompt, model settings, or other authoring fields.
3. When a learner chooses to try the sample chatbot from the team space, the Teacher Prompting System shall open the published student chat for that sample bot and shall not apply any learner-authored prompt override.
4. When a learner views the deployment brief or transcript excerpt, the Teacher Prompting System shall show those artifacts as read-only.

### Requirement 13: Offline notices

**Objective:** As a learner who is not sitting in the space, I want notices when the team forms or when it is my turn, so that the async activity can continue.

#### Acceptance Criteria

1. When a team is formed, a learner is assigned a current turn or targeted prompt, a per-person nudge is due, scores are revealed, or the activity is finalized, the Teacher Prompting System shall send a notice to that learner’s account email.
2. When a queue re-confirmation is due, the Teacher Prompting System shall send that notice to the waiting learner’s account email.
3. When a learner opens a notice destination, the Teacher Prompting System shall take them to the current team space or queue status for that offering.
4. The Teacher Prompting System shall not treat Workspace educator-invite recording as satisfying these activity notices.

### Requirement 14: Operator dashboard (queue and team progress)

**Objective:** As a course operator, I want to see queue status, stuck learners, and each team’s progress in one place, so that I can unblock waits and know how the activity is going without joining every team.

#### Acceptance Criteria

1. When one or more learners have waited 10 to 14 days without a quorum, the Teacher Prompting System shall list them on an operator dashboard with wait duration and offering identity.
2. When an operator selects eligible waiting learners and confirms a manual team of three, the Teacher Prompting System shall form that team and notify the three members.
3. If an operator attempts to form a team that is not three distinct waiting learners for the same offering, the Teacher Prompting System shall reject the match and leave those learners in the queue.
4. When an operator opens the offering dashboard, the Teacher Prompting System shall list every formed team with its current phase, its members, its last-activity time, and whether it was auto-finalized.
5. When an operator opens a team from the dashboard, the Teacher Prompting System shall let the operator view that team’s full contents, including the group chat, shared rubric, shared notes, submitted scores (held or revealed), absence marks, and the final deliverable.
6. While an operator is viewing a team space, the Teacher Prompting System shall treat the operator as a viewer and shall not let operator viewing post messages as a learner, edit shared documents, reset clocks, or advance phases.
7. The Teacher Prompting System shall not reveal held scores to team members earlier because an operator has viewed them.

### Requirement 15: Access, roles, and score privacy

**Objective:** As a learner, I want only my team to see our unfinished work, and I want my unreleased scores hidden, so that calibration is not leaked or anchored.

#### Acceptance Criteria

1. When a signed-in user is not a member of a team space and is not an operator for that offering, the Teacher Prompting System shall deny access to that space’s chat, documents, and scores.
2. When a learner is in a team, the Teacher Prompting System shall show that learner as Presenter or Critic only for the current critique round and shall not invent additional learner roles.
3. While scores are held before gated reveal, the Teacher Prompting System shall not expose another member’s numeric scores to any team member through the space, notices, or facilitator messages; operator viewing under Requirement 14 is the only exception.
4. When an operator views an offering, the Teacher Prompting System shall not place that operator in the matching queue as a learner unless they also check in as a learner.
5. The Teacher Prompting System shall not add activity learners to an educator Workspace as a consequence of joining a team.

### Requirement 16: Separation from authoring and live agent platforms

**Objective:** As an educator, I want this activity to sit beside existing authoring and publishing, so that calibration does not become bot co-editing or a live classroom tool.

#### Acceptance Criteria

1. When an educator prepares artifacts for an offering, the Teacher Prompting System shall let them keep using the existing Solo editor and published student chat without granting team learners edit rights on that bot.
2. The Teacher Prompting System shall not replace educator Workspaces, My bots, Publish, project share, or Community with the Rubric Calibration Space.
3. The Teacher Prompting System shall not require a live external conversational-agent room in order for a team to complete the activity.
4. The Teacher Prompting System shall not provide a simultaneous live-session alternative to the async flow defined in this specification.
