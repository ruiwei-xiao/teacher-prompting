# E2E Pilot Flow and Separation Boundaries (Task 8.2)

Scripted walk of the real calibration handlers on the JSON fallback store, plus source/API boundary checks. Two-browser named cursors are **not** faked as a pass.

**Evidence command (scripted flow + boundaries):**

```bash
npx tsx lib/calibration-api/e2e.selftest.ts
```

**Result (2026-08-15):** exit 0 — `OK: calibration-api e2e (check-in→lock→addendum) + boundary source/API checks`

The selftest injects `now = 2026-08-15T12:00:00.000Z`, sets `CALIBRATION_DATA_FILE` to a temp JSON file, and deletes `POSTGRES_URL*`. Facilitator LLM calls fall back to scripted templates when no API key is present (expected; progression is not blocked).

---

## Scripted E2E flow

| Step | Requirement | Result | Evidence |
|------|-------------|--------|----------|
| Three check-ins form a team of exactly three and take them out of the queue | 2.2 | **PASSED** | Third `postCheckIn` returns `status: "matched"` and a `teamId`; `of` remains 3 |
| Formation notices recorded for all three members | 5.1 | **PASSED** | `hasNotice("{memberUserIds}:{userId}:team_formed")` is true for each member; console fallback prints three `team_formed` lines |
| Recap message present in the team space | 5.2 | **PASSED** | Space GET messages and recap include a facilitator body matching `/calibrate a shared rubric/i` |
| Exactly three critique rounds; each member presents once | 6.1 | **PASSED** | For rounds 1–3, `space.presenterUserId` / `criticUserIds` drive `postMessage` (presenter then two critics); presenter set equals the three members; phase becomes `merge` |
| Merge snapshot with 3–4 criteria | 7.1 | **PASSED** | `postDocSnapshot` `{ text }` of three `key: rationale` lines; `rubricCriterionKeys` → `clarity`, `evidence`, `alignment` |
| All present agree `merge_complete` | 8.1 | **PASSED** | Three `postAgreement` `{ subject: "merge_complete" }` → phase `scoring` |
| Blind 1–5 scores with at least one criterion spread ≥ 2 | 8.7, 9.2 | **PASSED** | Scores 1 / 3 / 5 on `clarity` (spread 4); 3 and 4 on the other keys |
| Reveal on last present submission | 8.4 | **PASSED** | After the third `postScores`, `space.revealedAt` is set and matches `team.scoresRevealedAt` |
| Flagged criterion (≥2 spread) enters discussion | 9.2 | **PASSED** | `state.flaggedCriteria` includes `clarity`; phase is `discussion` |
| Discussion message on the flagged criterion | 9.3 | **PASSED** | `postMessage` from the named scorer on `clarity`; phase becomes `consensus` |
| All present agree `final_consensus` | 10.2 | **PASSED** | Three `postAgreement` `{ subject: "final_consensus" }` |
| Lock / finalized | 10.2, 10.4 | **PASSED** | `space.phase === "finalized"`, `space.locked === true`, `team.finalizedAt` set; later rubric snapshot POST → 409 |
| Addendum after lock; group rubric unchanged | 10.6 | **PASSED** | `postAddendum` `{ body }` → 200; `getTeamForMember` rubric snapshot still equals the merge text |

---

## Boundary checks

| Check | Requirement | Result | Evidence |
|-------|-------------|--------|----------|
| ArtifactsPanel / try-chat is `/chat/` with no editor href | 12.3, 16.1 | **PASSED** | `npx tsx lib/calibration-api/e2e.selftest.ts` reads `ArtifactsPanel.tsx` and `lib/calibration-ui/artifacts.ts`; `tryChatHref` returns `/chat/{slug\|id}` with no query; panel has no `/app/` or editor href; team page has no Solo editor links |
| No Workspace membership writes from calibration modules | 16.2, 15.5 | **PASSED** | Production calibration sources have no `workspace-store` import and no `createWorkspace` / `addMember` / invite / role-write calls. After the full handler walk, learner workspace lists stay empty and the operator workspace membership list is unchanged |
| No Bazaar / ClimateChangeAgent / external agent room | 16.3 | **PASSED** | Production calibration sources (`lib/calibration-*`, `components/calibration`, `app/activity`, `app/api/calibration`) contain no `Bazaar` or `ClimateChangeAgent` identifiers |
| No live-session / 35-minute mode copy in calibration UI | 16.4 | **PASSED** | Calibration UI sources (`components/calibration`, `lib/calibration-ui` excluding selftests, `app/activity`) contain no `35-minute`, `live-session`, or “everyone must be online” copy |
| GroupChatPanel / ScoreSheet / ArtifactsPanel have no Liveblocks | 7.5 | **PASSED** | Those three component sources contain no `liveblocks`, `@liveblocks`, `yjs`, or `CollaborationPlugin` |
| Two-browser named cursors on the shared rubric | 7.2 | **MANUAL** | Wiring (room id, CollaborationPlugin, named cursors, two Yjs docs) is proven in `npx tsx lib/calibration-ui/docs.selftest.ts` (task 6.2). A live dual-browser pass needs Liveblocks keys and two real browsers. This task does not invent a browser harness and does not treat the source wiring as a live PASS |
| Full flow on a local production build | task 8.2 done-when | **MANUAL / blocked-unrelated** | `npm run build` compiled, then failed TypeScript on a pre-existing error in `lib/calibration-api/space.ts:483` (`Type 'unknown' is not assignable to type 'CriterionScore[]'`). That file was not changed by this task. The scripted handler walk on the JSON fallback completed without that compile step |

---

## What this task did not run

- Live dual-browser cursor overlap (requires `LIVEBLOCKS_SECRET_KEY` and two browsers).
- A green `npm run build`. The failure is unrelated to `e2e.selftest.ts` / this document.
- Browser automation. The scripted pass drives `postCheckIn`, `getSpace`, `postMessage`, `postDocSnapshot`, `postScores`, `postAgreement`, and `postAddendum` with an injected clock.

---

## Design alignment

- **Boundary Commitments / Out of Boundary** — Solo editor, Publish, Workspaces, Community, and external agent rooms stay untouched; try-chat links to existing `/chat/`.
- **System Flows / Phase lifecycle** — Queue → critique (3 rounds) → merge → scoring → discussion → consensus → finalized.
- **System Flows / Gated reveal** — Reveal fires when every present member has submitted; spread flags at ≥2.
- **Testing Strategy / E2E / Manual Paths** — Scripted happy path through lock + addendum; two-browser cursors remain a manual Liveblocks path.
