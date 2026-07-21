# Implementation Plan

## 1. Foundation: star persistence and eligibility

- [x] 1.1 Persist personal stars (dual-store)
  - Define star preference record shapes and dual-store list/star/unstar with unique (user, bot), refresh starred time on star, ordered list by most recently starred (JSON + Postgres façades)
  - Starring then listing returns the bot first for that user in both storage modes; unstar is idempotent
  - _Requirements: 1.1, 1.3, 4.1, 4.2, 4.3, 4.4_
  - _Boundary: star-store_

- [ ] 1.2 Resolve star eligibility and open targets
  - Owned bots eligible with editor open target; Workspace-visible peer bots eligible with peer non-edit open target using existing visibility rules; inaccessible denied; deleted/inaccessible omitted from eligibility
  - Deterministic behavior for own allowed, peer visible allowed, peer hidden denied, and distinct open targets
  - _Requirements: 1.2, 1.6, 1.7, 2.4, 2.5, 5.3, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: star-api eligibility_
  - _Depends: 1.1_

- [ ] 1.3 Protect Starred routes at the auth edge
  - Require sign-in for Starred page and star APIs with callbackUrl return
  - Unauthenticated access redirects to sign-in rather than showing stars
  - _Requirements: 5.1, 5.2_
  - _Boundary: proxy_

## 2. Star HTTP APIs

- [ ] 2. Expose list / star / unstar APIs
  - Authenticated orchestration + HTTP routes: GET returns only eligible stars ordered by most recently starred with summaries and open targets; PUT stars when eligible; DELETE unstars idempotently; ineligible PUT forbidden
  - Signed-in owner can star owned bot; Participant cannot star hidden peer bot; deleted bots omitted from GET
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.6, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: star-api stars, Stars routes_
  - _Depends: 1.1, 1.2, 1.3_

## 3. Starred library and navigation UI

- [ ] 3.1 Build Starred library page
  - Dedicated Starred view loads the list API; empty and error states; Open uses provided open target (editor vs peer)
  - Empty state explains starring from My bots or Workspace lists; failed load is not silently empty
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1_
  - _Boundary: Starred page + grid_
  - _Depends: 2_

- [ ] 3.2 Enable Library Starred nav and remove Recently Used
  - Nav helper for Starred href/active rules; working Starred link with active state on Starred route; Recently Used control removed; My bots remains distinct
  - Sidebar Starred navigates to the Starred library (not Coming soon)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Boundary: WorkspaceSidebar, star-ui nav_
  - _Depends: 1.3, 3.1_

## 4. Star controls on existing bot lists

- [ ] 4.1 (P) Add star toggle on My bots cards
  - Star/unstar from My bots without leaving the list; clear starred/not-starred indication; same preference after refresh
  - Toggle calls star APIs and updates card state
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 7.1, 7.3, 7.4_
  - _Boundary: AppCard / AppGrid_
  - _Depends: 2_

- [ ] 4.2 (P) Add star toggle on Workspace bot cards
  - Star/unstar visible Workspace bots including peers; indication matches personal preference across surfaces after refresh
  - Peer bots can be starred when visible under existing rules
  - _Requirements: 1.2, 1.4, 1.5, 7.2, 7.4_
  - _Boundary: WorkspaceBotGrid_
  - _Depends: 2_

## 5. Validation

- [ ] 5.1 Star domain selftests
  - Runnable selftests for star persistence (order, idempotent unstar), eligibility/open-target cases, and list/star API orchestration filtering ineligible bots
  - `npx tsx` selftests pass for star-store and star-api modules
  - _Requirements: 1.2, 1.6, 2.1, 4.1, 4.2, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: star-store, star-api_
  - _Depends: 1.1, 1.2, 2_

- [ ] 5.2 Nav and proxy selftests
  - Cover Starred href/active path helpers and auth matcher gating for Starred page and star API paths
  - `npx tsx` selftests pass for star-ui nav and proxy matcher coverage
  - _Requirements: 3.1, 3.2, 5.1, 5.2_
  - _Boundary: star-ui nav, proxy_
  - _Depends: 1.3, 3.2_

- [ ]* 5.3 Manual E2E checklist for starred library
  - Optional deferred checklist: own star, peer star, (b) off deny, delete/leave eligibility, cross-session persistence, sidebar
  - Checklist document exists for post-MVP manual run
  - _Requirements: 1.1, 1.2, 2.4, 2.5, 3.1, 4.1, 6.1, 6.3, 7.2_
