# Research & Design Decisions: starred-bots

## Summary
- **Feature**: `starred-bots`
- **Discovery Scope**: Extension (personal library on existing apps + Workspace visibility)
- **Key Findings**:
  - No account-scoped star persistence exists; dual-store façades in `lib/app-store` and `lib/workspace-store` are the pattern to mirror.
  - There is **no** exported “visible in any Workspace” helper; star eligibility must compose ownership + placements + permission `(b)` / peer inspect rules.
  - Open destinations already differ: owned → `/app/{id}/editor`; peer → `peerBotPreviewHref` → `/workspace/{ws}/bots/{appId}`.

## Research Log

### Dual-store persistence
- **Context**: Requirements demand account-scoped stars across devices (not localStorage-only).
- **Sources Consulted**: `lib/app-store/store.ts`, `lib/workspace-store/store.ts`, `lib/auth/user-store.ts`
- **Findings**:
  - Backend chosen by `shouldUsePostgres()` (`POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL`).
  - JSON fallback under `.data/` with optional env override for tests.
  - Tables created at runtime (`CREATE TABLE IF NOT EXISTS`).
- **Implications**: New `lib/star-store` with unique `(user_id, app_id)` and `starred_at` column; façade exports only.

### Workspace visibility for peer bots
- **Context**: Requirements expanded to star Workspace-visible non-owned bots (Playlab-aligned).
- **Sources Consulted**: `lib/workspace-store/permissions.ts`, `lib/workspace-api/workspaces-placements.ts`, `lib/workspace-api/workspaces-bots.ts`, `lib/workspace-api/apps-gates.ts`
- **Findings**:
  - Per-workspace list filtering uses `bots.viewOthers` / ownership.
  - Peer snapshot uses membership + placement + `bots.inspectPeer` for non-owners.
  - `listConstrainingPlacementsForBot` is for delete gate `(d)`, **not** visibility `(b)`.
- **Implications**: Add `resolveStarEligibility` / `listAccessibleWorkspaceRefsForBot` in star-api (or thin workspace-api helper owned by this feature’s allowed dependency) that reuses permission asserts without redefining building permissions.

### UI surfaces and navigation
- **Context**: Star controls on My bots and Workspace lists; Starred page; remove Recently Used.
- **Sources Consulted**: `AppCard.tsx`, `AppGrid.tsx`, `WorkspaceBotGrid.tsx`, `WorkspaceSidebar.tsx`, `proxy.ts`
- **Findings**:
  - `AppCard` has no star props yet; Workspace cards are custom (not `AppCard`).
  - `/starred` and `/api/stars*` are not in `proxy.ts` matcher.
- **Implications**: Extend cards; auth-gate new routes; sidebar Link + active state; delete Recently Used placeholder.

### External / Playlab alignment
- **Context**: Product decision to match current Playlab Starred (not Recently Used).
- **Sources Consulted**: [Navigating Playlab](https://learn.playlab.ai/getstarted/Navigating%20Playlab), Playlab changelog “Starred Apps”
- **Findings**: Personal Starred page; apps pinned for quick access; sort by most recently starred; sidebar entry under personal library.
- **Implications**: Eligibility follows access, not ownership alone; Community-only starring remains deferred.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Account star store + eligibility service | Personal prefs dual-store; eligibility composes app-store + workspace ACL | Matches Playlab; clear data ownership | Cross-workspace scan cost on list | Cap/scan member workspaces only |
| Star flag on AppConfig | Put starred on bot record | Simple writes | Wrong privacy model; shared across users | Rejected |
| localStorage only | Client prefs | Fast ship | Fails Req 4 cross-device | Rejected |

## Design Decisions

### Decision: Account-scoped star rows, not AppConfig
- **Context**: Stars are personal preferences.
- **Alternatives Considered**:
  1. Field on `AppConfig` — wrong multi-user semantics
  2. User record array — couples user-store, weak sort/orphan handling
  3. Dedicated star store — dual-store façade
- **Selected Approach**: `user_stars (user_id, app_id PK, starred_at)`
- **Rationale**: Same persistence pattern as workspaces; unique key supports toggle; `starredAt` drives sort.
- **Trade-offs**: Extra module vs embedding in users.
- **Follow-up**: Lazy omit ineligible rows on list; optional prune on unstar/delete paths later.

### Decision: Eligibility = own OR Workspace-visible
- **Context**: Playlab-aligned starring of peer Workspace bots.
- **Alternatives Considered**:
  1. Owned only — simpler, rejected by product
  2. Own + any placement without (b) — over-exposes
  3. Own + same visibility as Workspace bot list / peer inspect
- **Selected Approach**: Option 3; for peers pick a concrete `workspaceId` for open href among accessible placements.
- **Rationale**: Reuses educator-workspaces ACL; open path matches existing peer preview.
- **Trade-offs**: List requires scanning user’s workspaces; acceptable at course scale with membership-bounded loops.
- **Follow-up**: Extract shared helper carefully; do not change permission matrix.

### Decision: Build store + thin star-api (no new npm deps)
- **Context**: Build vs adopt.
- **Selected Approach**: Build on existing dual-store + Auth.js; no favorites library.
- **Rationale**: Steering already standardizes this; `@vercel/postgres` deprecation is project-wide debt, not this feature’s migration.

## Risks & Mitigations
- Cross-workspace eligibility scan cost — Mitigate: only workspaces the user belongs to; short-circuit on first visible peer placement for open-href; selftests for filter correctness.
- Stale stars after leave/unplace — Mitigate: filter on every list/open; do not show ineligible entries (Req 6).
- Deepening `@vercel/postgres` usage — Mitigate: accept as existing project pattern; no migration in this spec.
- Accidental peer edit via Starred — Mitigate: non-owned open always uses peer preview href, never editor.

## References
- [Navigating Playlab](https://learn.playlab.ai/getstarted/Navigating%20Playlab)
- Playlab Product Changelog — Starred Apps
- Internal: `.kiro/specs/educator-workspaces/design.md` (placements, permission (b), peer inspect)
- Internal: `lib/workspace-store/store.ts`, `lib/app-store/store.ts`
