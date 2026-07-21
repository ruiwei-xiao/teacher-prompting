# Starred bots — manual E2E checklist (optional task 5.3)

Run after signing in as an educator. Mark each item when verified.

## Happy paths
- [ ] Star an owned bot on My bots → it appears first on `/starred` → Open goes to editor
- [ ] As a Workspace Participant with permission (b) on, star a peer’s placed bot → Open from `/starred` goes to peer preview (not editor)
- [ ] Star state matches across My bots, Workspace grid, and `/starred` after refresh

## Negative / eligibility
- [ ] With permission (b) off as Participant, peer bot cannot be starred (forbidden / no lasting star)
- [ ] Delete an owned starred bot → removed from My bots and not openable on `/starred`
- [ ] Leave Workspace / unplace peer bot → peer entry omitted from `/starred`

## Persistence & navigation
- [ ] Sign out and back in (or second browser session) → stars persist for the account
- [ ] Library sidebar: Starred works; Recently Used is absent; Starred shows active on `/starred`
- [ ] Unauthenticated visit to `/starred` redirects to sign-in with return path

## Load errors
- [ ] If star list API fails, `/starred` shows an error state (not a silent empty list)
