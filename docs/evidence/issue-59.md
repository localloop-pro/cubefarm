# Issue #59 local validation record

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
