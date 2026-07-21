# Brief: starred-bots

## Problem
Educators build and collaborate on many tutoring bots and need a personal shortcut list for the ones they return to often. The Library sidebar already shows a Starred placeholder, but it is disabled, so there is no Playlab-like way to pin accessible bots for quick access.

## Current State
- Sidebar (`WorkspaceSidebar`) has disabled **Starred** and **Recently Used** placeholders.
- Personal bots live in `lib/app-store` (owner-scoped); My bots UI is `/` → `AppGrid` / `AppCard`.
- Workspace-visible peer bots use placements + building permission (b); peer non-edit inspect exists via `educator-workspaces`.
- No account-scoped preference store for stars exists (theme/draft prefs are browser-local only).
- `educator-workspaces` explicitly excluded Starred / Recently Used.

## Desired Outcome
Playlab-aligned personal **Starred** library:
- Educators can star / unstar bots they **own** and bots they can **currently see via Workspace** (including others’ bots), under existing Workspace visibility rules.
- A dedicated `/starred` page lists eligible starred bots, sorted by most recently starred.
- Opening: owned → editor; non-owned accessible → existing peer non-edit inspect (no edit via star alone).
- Sidebar **Starred** navigates there and shows active state; **Recently Used** is removed to match current Playlab nav.
- Stars persist per account across devices (server dual-store), not only in one browser.

## Approach
**Account-scoped Star store (Approach A)** — new `lib/` dual-store (Postgres tagged SQL or JSON fallback), unique on `(userId, appId)` with `starredAt` as a column (not part of the key). Toggle + list APIs with eligibility checks (own **or** Workspace-visible). `/starred` page; star controls on `AppCard` and Workspace bot cards; wire sidebar.

Viability notes absorbed:
- Uniqueness must be `(userId, appId)`; `starredAt` updates on (re)star for sort order.
- Follow existing dual-store façade despite `@vercel/postgres` deprecation (same pattern as apps/workspaces; no migration in this feature).
- Eligibility reuses Workspace visibility; this feature does not redefine building permissions.

## Scope
- **In**:
  - Star / unstar owned bots and Workspace-visible (including peer-owned) bots
  - Account-scoped persistence (Postgres + JSON fallback)
  - `GET` list + toggle (or PUT/DELETE) APIs with eligibility
  - `/starred` page (owned open → editor; peer open → peer inspect)
  - Sidebar: enable Starred, remove Recently Used
  - Sort: most recently starred first
  - Graceful handling when a starred bot is deleted or no longer accessible
- **Out**:
  - Recently Used / recents history
  - Starring Community-only bots without ownership or Workspace visibility
  - Organization-level pins, Collections
  - Migrating off `@vercel/postgres`
  - Changing Workspace membership / placement / permission rules

## Boundary Candidates
- Star preference store + HTTP API (account × app + eligibility)
- Starred library UI (`/starred`, My bots + Workspace star toggles, sidebar)

## Out of Boundary
- Owning Workspace ACL / building-permission definitions (consume only)
- Community gallery starring (deferred)
- Recently Used
- Global bot metadata changes on `AppConfig` (stars are not ownership fields)

## Upstream / Downstream
- **Upstream**: Auth session `user.id`; `lib/app-store` ownership; Workspace placements + visibility + peer inspect from `educator-workspaces`; AppShell / AppCard / WorkspaceBotGrid patterns
- **Downstream**: Optional later Community starring; richer library filters

## Existing Spec Touchpoints
- **Extends**: none (new spec; educator-workspaces left this out on purpose)
- **Adjacent**: `educator-workspaces` (visibility + peer inspect + sidebar shell); `workspace-collections` (do not overlap)

## Constraints
- Spec language: English (match sibling specs)
- Never put star lists on `AppConfig`; stars are personal preferences
- Auth-gate `/starred` and star APIs like other private library routes
- Match dual-store and selftest conventions used by workspace/app stores
