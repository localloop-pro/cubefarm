# S0.1 baseline — issue #2

Recorded 2026-10-20 against exactly `d3b47c64c76caea5d2a2baffd5e2b41d8ba1e982`, on branch `codex/issue-2-baseline` in an isolated worktree. The tracked and untracked worktree status was clean before this report. This report is the only repository change.

Environment: macOS arm64, Node v24.11.0 (`/usr/local/bin/node`), npm 11.6.1, default timezone `Australia/Sydney` (AEDT). Fresh `npm ci --no-audit --no-fund` succeeded (exit 0, 435 packages). The lockfile was unchanged. Vitest isolates office state in a temporary `SWARM_HOME` and uses `SWARM_PORT=0`; no office server was started.

## Required checks

Commands ran sequentially, with `/usr/local/bin` first in PATH.

| Command | Exit | Result | Final nonempty output line |
| --- | --- | --- | --- |
| `npm run typecheck` | 0 | Passed; no TypeScript diagnostics | `> tsc --noEmit -p tsconfig.json` |
| `npm test` | 1 | 206 files passed, 1 failed; 2,298 tests passed, 1 failed, 2 skipped (2,301 total) | `at least ~2.48s faster with isolate: false — reuses workers across files instead of one per file` |

Failing test (complete list):

- `server/ledger.test.ts > merges > unlock the first merge, the night owl and the counts`, assertion at line 65. Expected `PR #7 on demo-co/pixel-todo at 02:14`; received `PR #7 on demo-co/pixel-todo at 03:14`.

The default-timezone baseline is RED. The failure is pre-existing at the exact base commit; it was not fixed as part of this documentation-only story.

## Diagnosis and comparison

The test's `at()` helper uses `new Date(2026, 9, 4, h, m)`. In `Australia/Sydney`, 2026-10-04 is the daylight-saving transition: 02:14 does not exist and JavaScript normalizes it to 03:14. The ledger correctly formats the normalized local time; the fixture's hardcoded 02:14 assertion is unsuitable for this timezone.

| Diagnostic command | Exit | Result | Final nonempty output line |
| --- | --- | --- | --- |
| `TZ=Australia/Sydney npx vitest run server/ledger.test.ts` | 1 | Same failure reproduced; 24 passed, 1 failed | `Duration 296ms (transform 76%, import 14%, tests 9%, worker 1%)` |
| `TZ=UTC npm test` | 0 | All 207 files passed; 2,299 tests passed, 2 skipped | `at least ~2.55s faster with isolate: false — reuses workers across files instead of one per file` |

UTC is a diagnostic comparison, not a replacement for the failed default-timezone baseline. Future repair should use a non-transition fixture date and validate in both Sydney and UTC. No product-code defect was demonstrated by this failure.

Both full runs also emitted the non-failing `THREE_CJS_DEPRECATED` warning about `require("three")`. The two skipped tests remain unverified. Build, browser/E2E checks, deployment, and other operating systems were outside this story and were not run.

## Tracking and next action

Issue: https://github.com/localloop-pro/cubefarm/issues/2

Approved plan revision: `f615ec2e7a01db884e9b5aef9c29a2bfc59762b4`.

Baseline evidence is recorded, but passing-baseline acceptance remains blocked by the Sydney fixture failure. Record/review this finding before releasing dependent implementation stories. Do not mark the suite GREEN on the strength of the UTC run alone. The next scoped repair is the ledger fixture; no such repair is included here.

The requested `featured_webapp_SPEC.TXT`, `Featured_todo.md`, and `Featured_done.db` are absent from this repository. This report and issue #2 track the baseline; no substitute tracker schema was created.
