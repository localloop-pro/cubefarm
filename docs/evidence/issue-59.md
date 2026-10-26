# Issue #59 local validation record

## QA round 1 follow-up (current)

Implementation/test SHA: **e993ffecb82a8991c74f67654d2b7fc1036da5cd**. Documentation/evidence follows in a separate commit. Fork `origin/main` was fetched and merged; it was already included.

[Brendan's failed review](https://github.com/localloop-pro/cubefarm/pull/60#issuecomment-6405504910) correctly found that targeted terminal PR details were handled only for issue tasks, allowing a fix writer to resume. Four new regressions also exposed a stale `fixing` record when terminal PRs were visible on the board. All four failed before the fix.

Recovery and board reconciliation now share terminal-fix handling: no fix writer resumes, the task clears, and its QA record leaves the actionable pipeline. The complete saved QA record (including summary, checks and evidence URLs) is retained in the developer's checkpoint log, alongside the explicit CLOSED or MERGED outcome. The worktree is neither prepared nor reset. Existing bounded log retention still applies; operators should archive evidence before subsequent work trims the log.

Verification at this SHA:

- Four real writeState/init/recover regressions: CLOSED/MERGED × hidden/visible board. Each checks zero session starts, no actionable QA record, untouched dirty content, unchanged owner gates, and evidence surviving another write/restart.
- Recovery matrix: **26 passed**. Focused recovery/safety suites: **138 passed**, 7 files.
- Full suite: **435 passed**, 1 existing todo, 36 files. Typecheck and build pass; existing large-chunk warning remains. `git diff --check` passes; no lint script exists.
- [Updated per-scenario timings](issue-59-round2-timings.txt): measured process restart cases 979 ms / 405 ms; fake-backend recovery measurements are not production SLAs.
- Disposable Playwright demo on frontend 5231/backend 15231 rechecked paused scheduling, session limit 2 and manager approval, with zero console errors and three existing dependency warnings. [Fresh screenshot](issue-59-round2-settings.png). Demo stopped. Terminal fix outcomes are verified by the four on-disk regressions, not this generic UI smoke check.

Current tracking: QA blocker implemented and locally validated; PR #60 awaits independent re-test. No new PR, production service operation, real agent, GitHub merge or deployment. The original validation below is historical and did not cover the terminal-fix gap.

## Initial submission (historical)

Implementation/test SHA: **02284c6f459de349331758cc24a28636ee88cdc7** on `swarm/issue-59-karen`, based on fork `origin/main`. The subsequent documentation commit adds this record, the runbook, README link and screenshots; it changes no implementation or tests.

Date: 2026-10-26, Australia/Sydney. Independent QA and manager acceptance remain pending. No production recovery claim is made.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| Focused recovery/safety command in timings artifact | 134 passed across 7 files |
| `server/crashRecovery.test.ts` alone | 22 passed, including 2 real SIGKILL/fresh-process cases |
| `npm test` | 431 passed, 1 existing todo, 36 files passed |
| `npm run build` | Pass; existing Rapier chunk-size warning |
| Lint | No lint script exists |
| `git diff --check` | Pass |
| Playwright demo UI | Restored stopped #3, PR #7 needs-human, no ready/merged cards; auto-assign and auto-merge off; pause, session limit 2, manager approval and pending hire visible |
| Production / host / service / provider checks | Unverified; deliberately not performed |

[Per-scenario measured timings](issue-59-timings.txt) are retained for all 22 cases. During the concurrent final validation run, real subprocess restart/snapshot/termination took **1395 ms** (uncheckpointed case) and **339 ms** (checkpointed case). In-process disk-load/recovery cases took **0.27–1.97 ms** with fake backend calls. These measurements use a monotonic clock; they are observations on this host under load, not recovery SLAs. Fake network and fake sessions exclude provider latency and time to finish a task.

## Browser evidence

The development demo used port **5231**, backend port **15231**, and only `node_modules/recovery-demo` for generated state. It was stopped after review. No ports 4317/5317 or live office state were used.

The normal demo restored task/settings/owner approval from the generated checkpoint. QA-card verification used Playwright WebSocket replay of the exported snapshot from actual `Swarm.init()` recovery with a fake remote PR, because the standard demo backend resets its fake PR collection. This is rendering evidence, distinct from the subprocess recovery tests. The board screenshot was refreshed against the committed implementation; the settings screenshot records the earlier successful review of the same unchanged UI and persisted gate values. No owner mutation button was clicked.

- [Board/task/QA screenshot](issue-59-qa.png): #3 stopped, PR #7 “needs you,” zero ready/merged cards, automatic merge/assignment unchecked.
- [Settings screenshot](issue-59-settings.png): scheduling paused, session limit 2, “I approve every hire.”
- Additional inspected views: Team displayed Ada stopped on #3; CEO & hiring displayed “Owner approval required” and the pending request.
- Successful browser snapshots reported zero console errors; three dependency deprecation warnings remained. The initial visual fixture had an invalid appearance value and was corrected before the successful review. Two later optional combined Playwright assertion attempts lost their browser context; they are not counted as passes. The retained images are successful captures, not the blank images from those attempts.

## Adversarial disposition

Local tests demonstrate retained durable task ownership, one resumed fake writer within capacity, no duplicate fake PR/merge side effect, fresh-head QA gating, remote reconciliation before replay, and no completion inference from an unavailable remote. Initial failures were corrected in `recover()`; an additional targeted lookup closes the bounded-board absence gap. Uncheckpointed changes remain explicitly outside the recovery guarantee.

The runbook records surviving state/log/temp/dirty-file evidence, manual reconciliation commands/steps, checkpoint timing limits, corrupt-file behavior, single-office ownership assumptions, unsupported host/provider/service checks and non-journaled external mutations. Those boundaries are not passed acceptance checks.

Tracking: local implementation, regression, adversarial review, runbook and browser review complete. Next task: teammate QA at the PR head, followed by manager disposition. The repository has no Featured application spec/tracker/database; issue #59 and these documents are the scoped records.
