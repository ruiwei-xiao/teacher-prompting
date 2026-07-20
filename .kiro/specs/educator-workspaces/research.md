# Research & Design Decisions: educator-workspaces

## Summary

- **Feature**: `educator-workspaces`
- **Discovery Scope**: Extension (brownfield) with complex authz cross-cutting — light discovery + prior gap analysis
- **Key Findings**:
  - Hybrid approach wins: new `lib/workspace-store` domain; extend shell/dashboard and gate apps share/delete; never gate student Publish with permission (c).
  - No email transport in repo — use in-app pending email invites + invite links; defer SMTP.
  - Peer inspect needs Workspace-scoped read-only snapshot (strip `apiKey`); editor PATCH stays owner-only via existing `getAppById(id, userId)`.

---

## Research Log

### Gap analysis (brownfield)

- **Context**: `$kiro-validate-gap educator-workspaces`
- **Sources Consulted**: Codebase (`lib/app-store`, `lib/auth`, `proxy.ts`, dashboard/shell), steering `tech.md` / `structure.md`, requirements
- **Findings**: Workspace domain absent; placeholder sidebar only; dual-store bootstrap pattern reusable; share/Publish live on apps PATCH
- **Implications**: Design must add full Workspace persistence/API/UI and carefully intersect apps mutations

### Invite delivery without mailer

- **Context**: Req 2.1 email invite; no nodemailer/Resend usage in app code
- **Sources Consulted**: Repo grep for sendEmail/invite; `user-store.getUserByEmail`
- **Findings**: Email can identify accounts; outbound mail not implemented
- **Implications**: Pending invite by email + accept on matching sign-in; invite links for course-scale joins; SMTP out of boundary

### Non-edit peer inspection

- **Context**: Req 4.6–4.7; owner-scoped editor APIs
- **Sources Consulted**: `getAppById` ownership filter; `SharedProjectEditor` pattern
- **Findings**: Non-owners already cannot PATCH; need explicit read path for placed bots
- **Implications**: `GET /api/workspaces/:id/bots/:appId` read-only snapshot + duplicate CTA; no membership-based edit

### Permission (c) vs Publish

- **Context**: Req 5.5–5.7, 7.2
- **Sources Consulted**: `app/api/apps/[appId]/route.ts` publish vs shareProject branches
- **Findings**: Distinct PATCH flags already exist
- **Implications**: Gate only educator outward share / place-to-other-WS; never `publish`

### Default building permissions

- **Context**: Course kickoff UX; Playlab guidance to start conservative
- **Sources Consulted**: Playlab building permissions docs; requirements 5.*
- **Findings**: Toggles are independent; facilitators open collaboration over time
- **Implications**: New Workspaces default (a)–(d) **off**

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A Extend app-store | Fold Workspace into apps module | Fewer modules | Domain bloat; weak Collections seam | Rejected |
| B Pure new module only | Workspace isolated; no apps API changes | Clean store | Cannot enforce (c)/(d) on share/delete | Incomplete alone |
| C Hybrid | New workspace-store + apps gates + shell UI | Matches steering; enforces policy | Cross-cutting authz discipline | **Selected** |

---

## Design Decisions

### Decision: Hybrid Workspace domain

- **Context**: Need clear ownership for membership/placement without breaking personal bots
- **Alternatives Considered**: A extend app-store; B isolated module without apps gates
- **Selected Approach**: Option C — `lib/workspace-store` + permission helper imported by apps routes
- **Rationale**: Aligns with store façades; protects Collections future; enforces Req 5
- **Trade-offs**: More integration points vs cleaner long-term boundary
- **Follow-up**: Manual authz checklist until tests exist

### Decision: In-app invites (no SMTP this phase)

- **Context**: Email invite required; no mailer
- **Alternatives Considered**: Add Resend/SMTP now; links only
- **Selected Approach**: Pending email invites + invite links; accept pending on sign-in
- **Rationale**: Unblocks course ops without new infra dependency
- **Trade-offs**: Invitee may not get inbox notification unless operator shares link/out-of-band
- **Follow-up**: Optional mail provider in later ops work (not `workspace-collections` unless specified)

### Decision: Conservative default permissions

- **Context**: Req 5 course facilitation
- **Selected Approach**: All building permissions false at create
- **Rationale**: Matches Playlab “start conservative” guidance for cohorts
- **Trade-offs**: Facilitators must toggle before peer browse/create-in-WS

### Decision: Permission (c) is Workspace-scoped (Playlab-aligned)

- **Context**: Design review rejected global “any constraining Workspace” rule; user requested Playlab alignment
- **Alternatives Considered**: (1) Deny if any placement WS has (c) off; (2) Evaluate only the action’s Workspace context
- **Selected Approach**: (2) — inside-WS sharing always allowed; beyond-WS share/place checks **that** Workspace’s (c); personal editor share without `workspaceId` does not apply (c); Publish never gated
- **Rationale**: Matches Playlab building-permissions docs (share beyond *the* workspace; per-workspace toggles)
- **Trade-offs**: Share from My bots without context bypasses (c); Workspace hub/share UI must pass `workspaceId`
- **Follow-up**: Ensure ShareDialog from hub always sends context

### Decision: Peer duplicate via dedicated API + shared fork helper

- **Context**: No REST duplicate today; only project-page `createApp` fork
- **Alternatives Considered**: (1) Only call project page patterns; (2) `POST /api/workspaces/:id/bots/:appId/duplicate` + `lib/app-store/fork.ts`
- **Selected Approach**: (2)
- **Rationale**: Peer bots may not be publicly project-shared; Workspace ACL belongs on a Workspace endpoint; one fork helper avoids drift
- **Trade-offs**: One extra route vs coupling to `/project` visibility rules

### Decision: Pending email accept hooked in auth.ts

- **Context**: Design review — accept path was unspecified
- **Selected Approach**: Call `acceptPendingEmailInvitesForUser` from Auth.js session/JWT bootstrap when email is present
- **Rationale**: Fulfills 2.1/2.3 without SMTP or a manual accept step

### Decision: Peer preview route

- **Context**: Non-edit inspect
- **Selected Approach**: `/workspace/[workspaceId]/bots/[appId]` + API snapshot without secrets + duplicate POST
- **Rationale**: Read-only inspect without granting editor PATCH to non-owners

---

## Synthesis Outcomes

### Generalization

- Membership ACL + building permissions collapse into one **`assertWorkspaceAction`** evaluator reused by Workspace APIs and apps gates.
- Invites (email vs link) share one invite record shape with `kind` discriminant.

### Build vs Adopt

- **Build** Workspace domain (no suitable in-repo library).
- **Adopt** existing Auth.js, dual-store bootstrap, dashboard/share/duplicate patterns.
- **Do not adopt** mail SDK this phase.

### Simplification

- No Organization layer; no Collections; no activity export.
- No separate “Viewer” role (Playlab Participant covers default members).
- Starred/Recently Used left non-functional or removable without replacement.

---

## Risks & Mitigations

- Authz leak of placements/members — Centralize checks in `permissions.ts`; deny-by-default; proxy matcher updated
- Publish accidentally gated — Explicit allowlist: only shareProject/Community educator fields call (c)
- Secret leakage in peer preview — Strip `apiKey` in snapshot mapper; review response types
- JSON store weak at 100+ members — Document Postgres for course deploys; index members in SQL path
- Invite spam / token abuse — Expiry + revoke; rate-limit join in implementation notes

---

## References

- [Workspace roles and permissions (Playlab)](https://learn.playlab.ai/features/Workspace%20Roles%20and%20Permissions)
- [Workspace building permissions (Playlab)](https://learn.playlab.ai/getstarted/Workspace%20Building%20Permissions)
- Steering: `.kiro/steering/tech.md`, `.kiro/steering/structure.md`, `.kiro/steering/product.md`
- Spec: `.kiro/specs/educator-workspaces/requirements.md`, `design.md`
- Deferred: `.kiro/specs/workspace-collections/`

---

## Appendix: Prior Gap Analysis Detail

The detailed requirement-to-asset map and effort ratings from `$kiro-validate-gap` informed the decisions above. Core verdict unchanged: reusable auth/app-store/share surfaces; Workspace CRUD/membership/placement/permissions/activity are net-new.
