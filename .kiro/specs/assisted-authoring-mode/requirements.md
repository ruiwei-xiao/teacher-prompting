# Requirements Document

## Introduction

Teacher Prompting helps educators author, evaluate, and publish AI tutoring bots. The product is also used for teacher AI training. Today, assisted authoring behaviors—automatic test case generation, prompt revision from edited AI responses, and a publish gate that requires all test cases to pass—are always on. That helps educators produce high-quality bots quickly, but it conflicts with training scenarios where educators must write prompts themselves without those assists.

This specification adds a per-bot **Assisted Authoring Mode** so educators can turn those assistive behaviors on or off. New bots default to OFF for training-friendly authoring. Existing bots remain ON so current assisted workflows are not disrupted. The toggle lives in bot Settings and is not shown on the Create a new App page.

Primary users are teachers and other educator-builders who edit bots. Student end-users of published tutoring chats are out of scope.

## Boundary Context

- **In scope**:
  - A per-bot Assisted Authoring Mode setting (ON / OFF) editable from bot Settings
  - Default OFF for newly created bots; treat bots that already existed before this feature as ON
  - While ON: keep today’s assisted behaviors (auto-generate test cases, revise prompt from AI response edits, require all test cases to pass before publish)
  - While OFF: disable those assisted behaviors; keep the right editor panel as a single try-chat against the Final Prompt with Clear conversation; allow publish without the all-pass test case gate
  - ON → OFF: discard assisted/auto-generated test cases (do not preserve/restore them); show an empty try-chat
  - OFF → ON: generate fresh assisted test cases for the current Final Prompt (no restore of discarded ON suites)
  - Keeping Create a new App free of this toggle
- **Out of scope**:
  - Exposing Assisted Authoring Mode on the Create a new App page
  - Changing student-facing published chat behavior
  - Multi-conversation archive / named try-sessions while OFF
  - Redesigning the full prompt-builder / instruction authoring experience unrelated to the three assisted behaviors above
  - Turning off general model settings (name, model, variability, API key) or unrelated sharing / Community features
  - Workspace building-permission policy changes
- **Adjacent expectations**:
  - Existing bot Settings already lets editors change name, model, variability, and API key; this feature adds one more setting on that surface
  - Existing test case generation, bubble-edit prompt revision, and publish gating remain the ON-mode behavior; this feature gates them by mode rather than inventing a separate evaluation system
  - Other prompt authoring aids (for example, instruction-panel helpers that are not the three assisted behaviors listed above) are not controlled by this toggle unless a later spec says otherwise
  - Editor onboarding / spotlight copy that assumes assisted test case workflows should not contradict or block educators while mode is OFF

## Project Description (Input)

This product is used both to help teachers build high-quality chatbots quickly and for teacher AI training. Today, assisted authoring features include:

- Automatic test case generation
- Automatic prompt revision when a teacher edits an AI (assistant bubble) response
- A publish gate that requires all test cases to pass

This feature adds a per-bot **Assisted Authoring Mode** toggle so those assistive behaviors can be turned on or off.

### Behavior

**ON (assisted) — current behavior**
- Test cases are auto-generated
- Editing AI responses can rewrite the prompt
- Publish is blocked until all test cases pass

**OFF (training / manual) — default for new bots**
- All assistive behaviors above are disabled
- Teachers must write the prompt themselves
- Test cases are not auto-generated
- The right panel stays available as a single try-chat to exercise the Final Prompt, with Clear conversation to start over
- Editing AI responses does not rewrite the prompt
- Publish is not gated on all test cases passing

### UI / placement
- Toggle lives in bot Settings
- Default for newly created bots: OFF
- Do **not** expose ON/OFF on the Create a new App page (keeps the creation flow simple for training users; the meaning of the toggle is hard to understand before using the product)

### Decided policies
- **Existing bots stay ON** so current assisted workflows are not disrupted. Only new bots default to OFF.
- **ON → OFF:** discard assisted test cases (do not preserve for later restore). Show a fresh try-chat. Auto-generation, response-edit → prompt revision, and the all-pass publish gate are disabled.
- **OFF → ON:** generate new assisted test cases for the current Final Prompt (do not restore discarded ON suites).

## Requirements

### Requirement 1: Assisted Authoring Mode setting

**Objective:** As an educator-builder, I want to turn Assisted Authoring Mode on or off for each bot in Settings, so that the same product can support both assisted creation and AI training.

#### Acceptance Criteria

1. When an educator who can edit a bot opens that bot’s Settings, the Teacher Prompting System shall show an Assisted Authoring Mode control with clear ON and OFF states.
2. When the educator saves a change to Assisted Authoring Mode for a bot, the Teacher Prompting System shall persist that mode for the bot and apply it on subsequent editor sessions for that bot.
3. When a new bot is created, the Teacher Prompting System shall set Assisted Authoring Mode to OFF by default.
4. When a bot already existed before Assisted Authoring Mode was introduced and has no explicit mode value, the Teacher Prompting System shall treat that bot as ON.
5. The Teacher Prompting System shall not show an Assisted Authoring Mode control on the Create a new App page.
6. If saving Assisted Authoring Mode fails, the Teacher Prompting System shall show an error and shall not silently leave the educator believing the mode changed.

### Requirement 2: Behavior while Assisted Authoring Mode is ON

**Objective:** As an educator-builder, I want ON mode to keep today’s assisted authoring workflow, so that quality-focused bot creation continues to work as it does now.

#### Acceptance Criteria

1. While Assisted Authoring Mode is ON for a bot, when test case generation is triggered by the existing assisted authoring flows, the Teacher Prompting System shall generate and show test cases for that bot.
2. While Assisted Authoring Mode is ON, when the educator edits an AI assistant response in a way that currently revises the prompt, the Teacher Prompting System shall continue to offer and apply that prompt-revision behavior.
3. While Assisted Authoring Mode is ON, when the educator attempts to publish and not every test case is marked pass, the Teacher Prompting System shall block publish and explain that all test cases must pass.
4. While Assisted Authoring Mode is ON, when every test case is marked pass and the educator publishes successfully under existing publish rules, the Teacher Prompting System shall allow publish.

### Requirement 3: Behavior while Assisted Authoring Mode is OFF

**Objective:** As an educator-builder in a training context, I want OFF mode to remove assisted shortcuts while still letting me try the bot, so that I author the prompt myself and can verify behavior in a simple chat.

#### Acceptance Criteria

1. While Assisted Authoring Mode is OFF for a bot, the Teacher Prompting System shall not auto-generate test cases for that bot.
2. While Assisted Authoring Mode is OFF, the Teacher Prompting System shall not revise the Final Prompt as a result of the educator editing an AI assistant response.
3. While Assisted Authoring Mode is OFF, the Teacher Prompting System shall show the right editor panel as a single try-chat against the current Final Prompt (not the assisted multi-case suite).
4. While Assisted Authoring Mode is OFF, the Teacher Prompting System shall provide a Clear conversation control that resets the try-chat so the educator can start a new attempt.
5. While Assisted Authoring Mode is OFF, when the educator publishes under existing publish rules, the Teacher Prompting System shall not block publish because test cases are missing or not all marked pass.
6. While Assisted Authoring Mode is OFF, the Teacher Prompting System shall still allow the educator to view and edit the Final Prompt and other non-assisted bot settings needed to author and publish manually.

### Requirement 4: Mode transitions

**Objective:** As an educator-builder, I want switching modes to cleanly separate the assisted suite from try-chat, so that OFF stays a simple testing surface and ON regenerates evaluation cases fresh.

#### Acceptance Criteria

1. When Assisted Authoring Mode changes from ON to OFF for a bot that has assisted test cases, the Teacher Prompting System shall discard those assisted test cases from the editor (not preserve them for later restore) and show a fresh try-chat.
2. When Assisted Authoring Mode changes from OFF to ON, the Teacher Prompting System shall generate new assisted test cases for the current Final Prompt rather than restoring any previously discarded ON suite.
3. When Assisted Authoring Mode changes from OFF to ON and test case generation fails, the Teacher Prompting System shall show an error, shall leave mode ON as saved, and shall not silently present discarded or mismatched cases as current.

### Requirement 5: Editor guidance consistency

**Objective:** As an educator-builder with mode OFF, I want editor guidance not to insist on assisted-only steps, so that training use is not confusing.

#### Acceptance Criteria

1. While Assisted Authoring Mode is OFF, the Teacher Prompting System shall not require the educator to complete assisted-only test case steps in order to continue basic editing or publishing.
2. While Assisted Authoring Mode is OFF, if the editor presents onboarding or spotlight guidance, the Teacher Prompting System shall avoid presenting assisted-only test case or all-pass publish steps as mandatory for that session.
