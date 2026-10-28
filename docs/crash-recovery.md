# Crash recovery verification and operator runbook

Scope: fork issue #59, issue/worktree/PR/QA orchestration. This is local process-loss evidence, not production recovery certification. No production office, real agents, GitHub mutation/merge, automation service, host reboot, deployment, or microphone work is part of this exercise.

## Plan and tracking

The Featured spec, approved plan, `Featured_todo.md`, and `Featured_done.db` are absent from this repository. Issue #59 is the task definition; this document records its cumulative plan and confirmed local results without inventing an unrelated application database.

- Completed: inspect real persistence/startup/recovery and existing safety tests.
- Completed: execute the disposable interruption matrix, reproduce failures, apply narrow recovery fixes, and rerun regression.
- Completed: disposable Playwright demo review of restored task, QA status and owner gates; retain screenshots below.
- Completed: QA round 1 terminal-fix follow-up, including hidden/visible CLOSED/MERGED regressions and preservation of the QA record in checkpoint logs.
- Completed: reused-branch review follow-up; ambiguous terminal issue PRs retain ownership for manual inspection, and exact saved PR identity takes precedence.
- Pending: independent teammate QA re-test of PR #60 and manager disposition. No merge or deployment is authorized here.
- Unverified operational exercises are listed under Boundaries; they are not local test passes or newly approved work.

## Reproduce safely

Run from the fork checkout with installed dependencies. Test configuration already redirects general test state; the recovery suite additionally creates its own office under this checkout's `node_modules/.cache-recovery-*`. It never reads a live office home. Subprocesses inherit explicit disposable `SWARM_HOME`, `SWARM_PORT=0`, and fake-only backend boundaries. Only the test subprocess is SIGKILLed. No port listener is needed for the matrix.

```sh
git rev-parse HEAD
npm run typecheck
npx vitest run server/crashRecovery.test.ts server/schedulerPause.test.ts server/ptyHost.test.ts server/stateFile.test.ts server/sessionSlots.integration.test.ts server/manualMerge.test.ts server/mergeGate.test.ts
npm test
npm run build
```

There is no lint script. `git diff --check` checks patch whitespace. A successful build may report the existing large Rapier chunk warning.

For named scenarios and measured timings, save output **without piping through a command that masks the exit status**:

```sh
npx vitest run server/crashRecovery.test.ts --reporter=verbose > node_modules/recovery-matrix.txt
```

The matrix deletes only its private test home after the suite; dirty-file and log preservation are asserted before cleanup. Preserve reports outside that private home. To retain a synthetic state and a snapshot taken after real startup recovery:

```sh
RECOVERY_EXPORT_DEMO=1 npx vitest run server/crashRecovery.test.ts --reporter=verbose > node_modules/recovery-matrix.txt
SWARM_HOME="$PWD/node_modules/recovery-demo" SWARM_PORT=15231 SWARM_CLIENT_PORT=5231 SWARM_START_PAUSED=1 npm run demo -- --no-open
```

Open `http://localhost:5231` (Vite may bind IPv6 localhost). Stop this launcher with Ctrl-C after reviewing. Ports 4317/5317 are never used. `node_modules/recovery-demo` contains only generated fake state and is disposable. Do not substitute a live home. Do not approve a hire, resume scheduling, send messages, or click a mutation button for the visual review.

The ordinary demo server restores the held task and settings from `demo-state.json`. Its fake GitHub PR collection resets at startup. For deterministic QA-card rendering, replay the exported `snapshot.json` over Playwright's WebSocket route before navigation; this snapshot came from `Swarm.init()` with the strict fake remote, not a handwritten UI state:

```js
// In a Playwright script, using the generated snapshot read from disk:
await page.routeWebSocket('**/ws', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));
});
await page.goto('http://localhost:5231');
```

Enter the office. At the manager desk, press E: Settings shows scheduling paused, session limit 2, and manager approval for hires. Floors shows auto-assign and auto-merge unchecked. Team shows Ada stopped on #3. CEO & hiring shows the pending owner decision. For the board, set the saved player view before reloading:

```js
await page.evaluate(() => localStorage.setItem('cubefarm:view', JSON.stringify({
  floor: 1, x: 0, z: -10, yaw: 0, pitch: 0,
})));
await page.reload();
```

Enter and press E at the board. #3 remains stopped/in progress; PR #7 says “needs you”; ready-to-merge and merged counts are zero. This proves UI rendering of recovered state; it does not prove production transport, provider durability, or remote side effects. Retained [board/task/QA screenshot](evidence/issue-59-qa.png) and [settings/owner-gate screenshot](evidence/issue-59-settings.png).

## Interruption matrix

`server/crashRecovery.test.ts` uses real `writeState()` (JSON + temp/rename), `init()` (disk read and migration), `recover()`, PR reconciliation, scheduling and merge gates. Only the backend is fake. Core methods are not replaced. The strict backend throws on unexpected external access. `server/fixtures/crashOffice.ts` is the fake-only child entry point; it imports no real backend.

| Boundary / scenario | Surviving evidence and required result |
| --- | --- |
| Actual SIGKILL before pending save / after completed checkpoint | Fresh subprocess sees old idle state / saved task resumes one fake session. No graceful shutdown checkpoint. |
| Issue, fix, QA changed before save timer | Previous checkpoint survives; the uncheckpointed task is absent. Explicitly a limitation, not recovered work. |
| Issue and fix after checkpoint | Same session and desk resume once, repeated scheduler passes create no extra writer; dirty file and checkpoint log survive; task remains owned. |
| Assignment checkpoint while desk prepare awaits | Task/branch/owner survive as stopped; no session ID means no replay/reset/reassignment. |
| Interrupted QA after checkpoint | Requeued while paused, fresh head read on resume, old run never accepted; one new QA session on repeated scheduling. |
| Fake PR succeeds before local acknowledgement | Startup fetch discovers it and queues QA; issue writer does not resume/create another PR. |
| Fake PR is CLOSED or MERGED before acknowledgement | Remote state is reconciled without another writer or merge. A saved PR identity allows task cleanup; a branch-only terminal match is ambiguous across attempts and holds the issue for inspection. Closure is not claimed as a merge. |
| Terminal fix PR, hidden from or visible on the board | CLOSED/MERGED clears the task and active QA record without writer replay; complete QA evidence and explicit outcome survive in the developer checkpoint log and another restart; dirty file unchanged. |
| Fake PR outside bounded board window | Targeted branch lookup and PR details precede recovery; no writer replay. |
| Board read or targeted read unavailable | Task remains stopped and owned; no writer starts and no completion is inferred. |
| Fake merge succeeds then acknowledgement throws | Restart reads fake MERGED state, removes finished QA, never repeats the merge. |
| Saved QA pass, remote head changed / unchanged | New head requeues and drops pass / matching tested SHA may merge once through existing gates. |
| Rename interrupted after temp write | Old complete checkpoint remains loadable; temp evidence contains newer work but is never promoted automatically. |
| Two durable writers with limit 2 | One worker resumes, CEO reservation retained; second task remains stopped and owned. |
| Interrupted fix without durable session | QA moves to needs-human, developer remains stopped; no replacement writer. |
| Persisted owner/pause gates | Pause, pending approval, hiring policy, capacity, auto-assign and auto-merge settings survive; needs-human remains gated. |

Existing `schedulerPause.test.ts` verifies pause/launch races; `ptyHost.test.ts` verifies keeper reconnect; session-slot and merge-safety suites supply their existing adversarial coverage. This suite does not copy those implementations into a second policy model.

The matrix initially exposed three failures: preparation ownership was discarded and immediately reassigned, a known remotely created PR still resumed an issue writer, and failed remote reads still resumed uncertain work. Inspection also found the board is bounded (50 open, 8 merged, no closed PRs), so absence on that board is insufficient evidence. Recovery now preserves held tasks, discovers existing PRs (including a targeted lookup when absent from the board), and fails closed on unreadable remote state. Interrupted QA retains its existing restart behavior. This is a narrow recovery change, not an operation journal or new scheduler/provider.

## Operator fallback: preserve, inspect, reconcile, then choose

These are instructions for an authorized recovery operator, not commands executed against production by this verification.

1. Keep scheduling paused during inspection. Preserve the office state file, any `.tmp` checkpoint, desk/worktree (including untracked files), terminal captures, logs, screenshots, and QA comment/evidence URLs. Save their timestamps and the running code SHA. Do not reset, clean, remove a desk, or automatically promote a temp file.
2. Check whether a keeper still owns a CLI. A reconnecting session is already a writer; do not start another. This suite reuses keeper tests and does not certify provider handoff.
3. Read GitHub before retrying anything uncertain: issue open/closed state, exact branch PR across all states, PR head SHA, merged/closed state, checks, existing QA comments and uploaded evidence. Board absence alone is not evidence of failure. Branches can be reused on reassignment; a historical terminal PR without a saved PR identity cannot establish the outcome of the current attempt. Keep ambiguous work stopped and owned for manual inspection. If remote reads fail, keep the task held. Do not replay create-issue, PR, comment/upload, branch-update or merge operations merely because acknowledgement was lost.
4. For an existing open PR, continue QA on its current head rather than opening a replacement. A saved QA pass covers only its `passedSha`; a changed head requires a new QA run. For a remotely merged PR, reconcile the completed remote outcome; for a closed PR, decide whether further work is wanted rather than labelling it merged.
5. A stopped issue/fix with a saved session can be resumed explicitly through its existing desk after inspection. A task held for missing session/branch needs manual worktree review: preserve changes first, then deliberately clear/reassign with the manager's controls if appropriate. Do not bypass pending hire approvals, needs-human QA, auto-merge settings or capacity limits. Pause blocks autonomous recovery; removing pause does not automatically replay held stopped sessions.
6. Record the remote IDs, tested/current SHA, operator decision and preserved evidence. Resume only after a single owner/writer is established. Unsupported outcomes stay unresolved; no “done” entry merely because a process restarted.

Terminal fix records leave the active QA pipeline after confirmed closure/merge. Their complete QA evidence is copied into the developer log before removal; archive that evidence before normal bounded-log trimming removes old entries. CLOSED is logged as CLOSED, never as a successful merge.

Read-only inspection examples (replace placeholders; no mutation is implied):

```sh
git -C /path/to/preserved-desk status --short --branch
git -C /path/to/preserved-desk diff --binary
git -C /path/to/preserved-desk log -5 --oneline
gh issue view ISSUE_NUMBER -R OWNER/REPO --json number,state,title
gh pr list -R OWNER/REPO --head swarm/issue-N-AGENT --state all --json number,state,url,headRefName
gh pr view PR_NUMBER -R OWNER/REPO --json number,state,headRefOid,mergedAt,statusCheckRollup
gh pr view PR_NUMBER -R OWNER/REPO --comments
```

## Boundaries and failure modes

- `save()` waits up to 1.5 seconds; session IDs and later log lines can be newer than the checkpoint. Pre-checkpoint work is not guaranteed recoverable. Dirty files may survive independently, but require inspection.
- A completed rename is the tested process-crash checkpoint boundary. There is no file/directory fsync guarantee here. Power loss, disk/controller failures, host reboot and filesystem durability are **unverified**.
- The precise SIGKILL checks cover issue state before/after checkpoint. Remaining matrix rows use deterministic memory/timer loss and fault injection against real disk/recovery paths, not OS kills at every instruction.
- Only one office process owns each disposable home. Checkpoint writes inside that process are serialized through one queue, so an autosave already in flight completes before a later issue-operation checkpoint and cannot overwrite it through the shared `.tmp` path. Multiple office processes writing the same state file remain **unverified** and are not protected by an inter-process lock or journal.
- Real GitHub consistency, pagination beyond the targeted branch query, network partitions, provider SDK/CLI session resumption, service-manager restarts, PTY survival over a host reboot and cross-provider handoff are **unverified**. An autonomous model's actions cannot be proven exactly-once by fake session tests.
- Manager, API and CEO issue filing write a durable operation record before GitHub, including a payload fingerprint and deterministic body marker. New operations persist distinct `ready` and `attempting` checkpoints; only `ready` can be replayed, while `attempting`, `unresolved`, and legacy `pending` records must reconcile first. Same-key calls are single-writer, while unrelated keys and repositories can enter GitHub concurrently. Missing or empty manager/API keys generate a UUID for pre-upgrade callers; non-empty malformed keys are rejected. If a call returns unresolved, retry only with the same idempotency key and exact payload. The office enumerates every REST issue page across open and closed states instead of relying on GitHub search indexing, then performs bounded reconciliation reads to tolerate short visibility delay. A marker match returns that issue number; read failure or repeated authoritative misses leave the operation unresolved and never replay the write automatically. To investigate manually, keep scheduling paused, preserve `state.json`, read the matching operation's marker/key/repo/fingerprint, and inspect issues in that repository for the exact marker before deciding whether provider evidence is sufficient for manual recovery. Do not edit or clear the operation record to force a write. Manager UI retries retain their key in the open form; CEO `file_issue` must supply and reuse `idempotency_key` on retries. Fake-backend tests verify concurrent autosave ordering, restart after lost acknowledgement, delayed marker visibility, per-key serialization and independent-key progress. Remaining provider limits are real GitHub REST consistency, pagination completion within the CLI timeout/buffer, network partitions, and server-side writes whose acknowledgement and subsequent reads both remain unavailable; these fail closed for manual review. QA comment/upload acknowledgement loss and external side effects inside agent sessions still require manual reconciliation.
- Corrupt state, disk full, permission errors and failed checkpoint retries are not exhaustively tested. Startup currently treats read/parse failure as first run; preserve originals and investigate before operating an apparently empty office. Temp-before-rename failure is the tested storage fault.
- Real workspace git cleanup is not invoked by the fake backend. Byte preservation in a disposable desk and no prepare/reset call during recovery are asserted; existing workspace tests cover git behavior separately.

## Validation record

See [issue-59 validation evidence](evidence/issue-59.md) for the exact tested implementation SHA, commands, results, measured recovery time and browser boundaries. Next task is independent PR QA; none of the unverified operational exercises is silently accepted.
