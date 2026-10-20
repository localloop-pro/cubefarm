# Safety integration plan

Status: review gate. Base: `codex/integrate-safety-upstream @ d3b47c64c76caea5d2a2baffd5e2b41d8ba1e982`.

## Execution contract

- Every issue body must say `Base: <branch> @ <40-char SHA>`. Branch from that exact SHA; if absent or stale, stop and comment.
- Never run `git show`, `git diff`, `git checkout`, or `git cherry-pick` against `4301211` or a branch containing it. Implement only from the issue and current base. Review rejects matching old hunks.
- One story per branch/PR; touch only `owns` files. PR title: `S<x.y>: <name>`; label `safety-integration`; body links issue, lists files, command, and final output line.
- Pass means command exit `0`, zero failures, typecheck exit `0` where named, and no new failure versus S0.1. Story GREEN = focused test + Code Review + Security. The next serial story branches from the merged GREEN SHA.
- Security fails closed. Request checks mitigate browser/CSRF/DNS rebinding, not local-process access or authentication.
- Terms: **housekeeping** = usage/progress/update-drain/save ticks; **branch-holder** = another worktree currently checking out the target branch; **quarantine** = retain malformed state without scheduling it and emit a visible diagnostic.

## Epic 0 — Baseline and review protocol

**Graph:** exact clean base → typecheck/unit → recorded evidence → story branches.

- **S0.1 Baseline** — owns `docs/baseline-d3b47c6.md`; depends on none. Run `npm run typecheck && npm test`. Record SHA, status, exit codes, failing names, and final lines.
- **S0.2 Review protocol** — owns issue/PR metadata only; depends on S0.1. Accept only contract-compliant work; no product files.

## Epic 1 — Local HTTP/WebSocket boundary

**Graph:** request/upgrade → exact Host + browser policy → token exception or route/WS → allow/`403`.

- **S1.1 Pure policy** — owns `server/requestBoundary.ts`, `server/requestBoundary.test.ts`; depends on S0. Loopback forms are exactly `127.0.0.1`, `localhost`, `[::1]` with bound `PORT`; reject `0.0.0.0`, `127.1`, numeric/octal forms, trailing dot, suffix/userinfo/path/query, wrong port, duplicate/malformed headers. Dev additionally allows exact `SWARM_CLIENT_PORT`. `Sec-Fetch-Site: cross-site` always rejects. Safe GET/HEAD may omit Origin only with Fetch Metadata absent/`none`/`same-origin`; unsafe browser methods need exact allowed Origin. Run `npx vitest run server/requestBoundary.test.ts`.
- **S1.2 HTTP + token exceptions** — owns `server/index.ts`, a side-effect-free lookup export in `server/cliRunner.ts`, additions to `server/cliRunner.test.ts`, new `server/requestBoundary.integration.test.ts`; depends on S1.1. The only originless unsafe exceptions are `POST /api/hooks/:token` and `POST /api/mcp/:token`; validate token before `express.json`, reject look-alikes. All other APIs use the policy. Run `npx vitest run server/requestBoundary.test.ts server/requestBoundary.integration.test.ts server/cliRunner.test.ts`.
- **S1.3 WebSocket + browser proof** — owns `server/index.ts`, `e2e/securityBoundary.spec.ts`; depends on S1.2. Apply policy to `/ws` and `/ws/term`; prove production and Vite proxy valid paths plus hostile Host/Origin/Fetch Metadata/read/write/WS rejection. Run `npm run test:e2e -- e2e/securityBoundary.spec.ts`.

## Epic 2 — Exact-current-head merge safety

**Graph:** manual/auto merge → one fresh complete PR detail → currently-passed QA → pure gate → `--match-head-commit` or `409/requeue`.

- **S2.1 Fresh PR/check model** — owns `server/github.ts`, additions to `server/github.test.ts`; depends on S0. Extend `prDetails` to return `state,isDraft,reviewDecision,headSha,mergeable,mergeState,checks` in one call. No checks or neutral/skipped-only = `none`, never passing. New fields stay optional until S2.3. Run `npx vitest run server/github.test.ts`.
- **S2.2 Pure gate** — owns `server/mergeGate.ts`, additions to `server/mergeGate.test.ts`; depends on S0. Delete legacy synthesis of missing `passedSha`. Require QA record status `passed`, non-null `passedSha === fresh headSha`, open/non-draft, explicit passing CI, no requested changes, clean/up-to-date merge state. Run `npx vitest run server/mergeGate.test.ts`.
- **S2.3 Manual/auto parity** — owns narrow `server/swarm.ts`, new `server/manualMerge.test.ts`; depends on S2.1 + S2.2 and is first in the serial `swarm.ts` lane. Both paths gate only the one fresh complete detail; backend receives `rec.passedSha` as expected SHA. Run `npx vitest run server/github.test.ts server/mergeGate.test.ts server/manualMerge.test.ts`.
- **S2.4 Branch update retest** — owns narrow `server/swarm.ts`, additions to `server/manualMerge.test.ts`; depends on merged S2.3 SHA, next serial lane step. Update invalidates QA and requeues; never assign the new head to old `passedSha`. Run `npx vitest run server/mergeGate.test.ts server/manualMerge.test.ts server/qaOutcome.test.ts server/qaRetry.test.ts`.
- **S2.5 Adversarial matrix** — owns `server/manualMerge.test.ts`, `server/mergeGate.test.ts`, `server/github.test.ts`; depends on S2.4. Every negative path calls merge zero times; only exact tested SHA merges once. Run the three named tests.

## Epic 3 — Scheduling pause

**Graph:** persisted/env state → every autonomous prepare/start/retry/merge → recheck immediately before effect → hold/run.

- **S3.1 State** — owns `shared/types.ts`, narrow `server/swarm.ts`, new `server/schedulerPause.test.ts`; depends on merged S2.4 SHA, next serial lane step. Add `schedulerPaused: boolean`, default false; persist it; `SWARM_START_PAUSED=1` may force true but never clear stored true. Run `npx vitest run server/schedulerPause.test.ts && npm run typecheck`.
- **S3.2 UI** — owns `client/src/ui/ManagerConsole.tsx`, new `client/src/ui/ManagerConsole.test.tsx`; depends on S3.1. Current API/store pattern only. Run `npx vitest run client/src/ui/ManagerConsole.test.tsx && npm run typecheck`.
- **S3.3 Gates** — owns narrow `server/swarm.ts`, additions to `server/schedulerPause.test.ts`; depends on merged S3.1 SHA, next serial lane step. Block queued dev/QA/fix/CEO, recovery, retry/nudge, and auto-merge; recheck after async prepare and immediately before launch/automatic merge. A manager may message a running CEO; an idle paused CEO must not start from a queued message. Running sessions and housekeeping continue. Run `npx vitest run server/schedulerPause.test.ts`.
- **S3.4 Races** — owns `server/schedulerPause.test.ts`; depends on S3.3. Cover pause-during-prepare, restart/env, every autonomous path, running work, idle CEO message, and exactly one resume. Run `npx vitest run server/schedulerPause.test.ts && npm run typecheck`.

## Epic 4 — Session capacity with CEO reserve

**Graph:** prepare/start → atomic reservation (preparing + running) → recheck → launch → release on finish/failure/abort/hold.

- **S4.1 Pure policy** — owns `server/sessionSlots.ts`, `server/sessionSlots.test.ts`; depends on S0. Hard cap is `settings.sessionLimit`; `0` unlimited; when positive reserve one slot for idle CEO. Cover `0/1/N`, CEO idle/busy, boundaries. Run `npx vitest run server/sessionSlots.test.ts`.
- **S4.2 Integration** — owns narrow `server/swarm.ts`, new `server/sessionSlots.integration.test.ts`; depends on merged S3.3 SHA + S4.1, next serial lane step. Scheduler, recovery, QA/fix, assignment and CEO atomically reserve/recheck; release in `finally` after failure, abort, or pause-hold. N failed preparations leave zero reservations; concurrent starts never oversubscribe or deadlock CEO/workers. Auto-merge consumes no session slot but obeys S3 pause. Run `npx vitest run server/sessionSlots.test.ts server/sessionSlots.integration.test.ts server/schedulerPause.test.ts`.

## Epic 5 — Workspace and state compatibility

- **S5.1 Dirty-worktree safety** — owns narrow `server/workspace.ts`, additions to `server/workspace.test.ts`; depends on S0. Graph: prepare → repo lock → branch-holder + full porcelain including untracked → refuse dirty → reuse/rebuild. Enumerate and guard before `checkout --force`, `reset --hard`, `clean -fd`, `worktree remove --force`, and recursive removal. Preservation strategy is refusal: no destructive path runs on tracked or untracked changes; failure cannot fall through. Preserve current realpath/machine/stale-lock/detached/Windows behavior. Run `npx vitest run server/workspace.test.ts`.
- **S5.2 Compatibility audit** — owns additions to `server/stateFile.test.ts`; conditional narrow `Swarm.init()` edits in `server/swarm.ts`; depends on merged S4.2 SHA, final serial lane step. Validate only known legacy roles; explicitly migrate or quarantine unknown values with a diagnostic. Never port `stateCompat.ts`. Run `npx vitest run server/stateFile.test.ts && npm run typecheck`.

## Epic 6 — Final gate

- **S6.1 Documentation** — owns `docs/local-safety.md`; depends on S0. Threat model, loopback limits, no public tunnel/LAN, least privilege, pause/cap semantics. Review only.
- **S6.2 Assembled verification** — owns test fixes only; depends on all implementation stories. Run focused commands, then `npm run typecheck`, `npm test`, and full `npm run test:e2e`. Required CI is workflow `.github/workflows/ci.yml`; no behavior changes are allowed here.
- **S6.3 Approval record** — owns `docs/safety-integration-approval.md`; depends on S6.2 + green CI. Record Code Review, Security, and **flagship = adversarial security reviewer role** as GREEN/RED against the same assembled 40-char SHA. Merge/closure requires all GREEN.

## Parallel and serial lanes

After S0, S1.1, S2.1, S2.2, S4.1, S5.1, and S6.1 may run in parallel. All `server/swarm.ts` stories are strictly serial and rebased on the merged predecessor: `S2.3 → S2.4 → S3.1 → S3.3 → S4.2 → S5.2`. Other dependencies are stated per story.
