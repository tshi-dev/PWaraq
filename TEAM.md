# Waraq team (from 27 Oct 2026)

One manager session (this chat) and small, single-job worker sessions. The manager plans, briefs, checks results and talks to the owner; it does not do the work itself except quick checks (< 10 tool calls). Workers get ONE job each, a brief of ≤ 25 lines, and the cheapest model that can do it.

## Roles

| Role | Model / effort | Job | Done = |
|---|---|---|---|
| **Manager** (this chat) | Opus, medium (Fable only for planning) | plan, write briefs, start ≤ 2 workers at a time, read their 5-line reports, decide, talk to the owner | owner has a plain answer |
| **Builder** | Sonnet, medium | one feature or fix in `waraq-next`, with its unit/e2e test, committed (named files, owner is the author) | `pnpm check` 0/0, unit + the touched e2e specs green, 5-line report |
| **Tester** | Sonnet, low | runs the existing suites / Chrome test on a build, no fixes; reports failures with exact steps | report in `Archive-2026-10-12/reviews/` |
| **Releaser** | Sonnet, low | sync PWaraq (subtree), stage the site (`sync-app` → `make-zip` → `check` → `deploy --dry-run`), update-manifest, release notes; never pushes/uploads without the owner's words quoted in the brief | hashes + rollback id in the report |
| **Researcher** | Haiku or Sonnet, low | read-only: docs, licences, GitHub repos, measurements; one page of findings | one-page memo |

Owner-only actions (never a session): double-click `build-signed.cmd`; Cloudflare production upload confirm ("yes" in chat → manager runs `deploy.cjs --production --yes-owner-approved`); GitHub releases (`gh release create` — blocked for sessions); Microsoft/Apple accounts and payments.

## Token rules
- Briefs point at ONE file section (a PLAN.md heading or a test name), never "read everything".
- Workers report in 5 lines: what changed, commit hash, test numbers, what is left, risk. No transcripts, no screenshots unless asked.
- Builders and Testers never run the full e2e suite; only the specs they touched. The manager runs the full suite once per release on the built app.
- Guard: all sessions on Sonnet/Haiku; Fable never for workers; stop starting new workers at 85 % of the 5-hour window.
- ≤ 2 workers at once; a third only if both are read-only.

## Naming
Session titles: `W: <area> — <one-line job>` (e.g. `W: Edit — white cover in Comment task`). Reports: `Archive-2026-10-12/reviews/<AREA>-<date>.md`.
