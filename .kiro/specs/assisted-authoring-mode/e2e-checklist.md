# Assisted Authoring Mode — Manual E2E Checklist

Post-MVP manual verification for `assisted-authoring-mode`.

## Defaults and Settings

- [ ] Create a **new** bot → Assisted Authoring Mode is **OFF** in Settings; no Create-page mode control exists
- [ ] Open a **legacy** bot (created before this feature) → mode resolves **ON**; assisted test cases / publish gate still work
- [ ] Settings: toggle ON/OFF, Save → value persists after reload
- [ ] Settings: force a save failure (e.g. offline) → error shown; UI does not claim success

## OFF behavior (training)

- [ ] With mode OFF: Final Prompt editable; no auto test-case generation
- [ ] With mode OFF: right panel shows a single try-chat (not multi-case suite); no Update-prompt-from-edits strip
- [ ] With mode OFF: Clear conversation resets the try-chat
- [ ] With mode OFF: Publish succeeds without all test cases passing
- [ ] With mode OFF: spotlight does not force assisted-only test case / all-pass steps

## ON behavior (assisted)

- [ ] With mode ON: test cases generate / show; Update prompt from bubble edits available
- [ ] With mode ON: Publish blocked until all test cases marked pass

## Transitions

- [ ] ON → OFF: assisted test cases discarded; fresh try-chat shown (not restored later)
- [ ] OFF → ON: new assisted test cases generate for current Final Prompt
- [ ] OFF → ON regenerate failure: error shown; mode stays ON; stale/discarded cases not presented as current

## Create page exclusion (Req 1.5)

- [ ] Create a new App flow has **no** Assisted Authoring Mode control
