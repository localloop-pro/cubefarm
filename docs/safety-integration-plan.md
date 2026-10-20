# Safety integration plan

Status: review gate. Base: `upstream/main` at `d3b47c6`. Preservation reference: `4301211` (evidence only).

## Guardrails

- Never cherry-pick `4301211` or copy its `swarm.ts`, `workspace.ts`, `types.ts`, store, smoke, Playwright, or large test files.
- Each story is one narrow branch/PR, owns only its named files, and must pass its focused command plus Code Review/Security before the next story branches from that approved SHA.
- Security failure is closed: reject, hold, or requeue. Host/origin checks reduce browser/CSRF/DNS-rebinding risk; they are not authentication.
- Story green: focused tests + Code Review + Security. Final green: the assembled successor chain additionally passes current-head QA, required CI, and Epic 6.

## Epic 0 — Baseline

**Call graph:** clean upstream branch → typecheck + unit suite → recorded baseline → story work.

- **S0.1 Baseline** — owns: test record only. Run `npm run typecheck && npm test`. Accept: SHA/status and any pre-existing failure recorded; no product changes.
- **S0.2 Review gate** — owns: branch workflow only. Accept: each story branch starts from its approved predecessor and no dependent story starts while red.

## Epic 1 — Local request boundary

**Call graph:** HTTP/WS request → `trustedOfficeRequest` → exact loopback host/port + browser-origin policy → route/upgrade or `403`.

- **S1.1 Policy helper** — owns: `server/requestBoundary.ts`, `server/requestBoundary.test.ts`. Policy: exact loopback Host on the bound server port; in dev, explicitly configured Vite client Host/Origin only (never forwarded headers). Same-origin safe GET/HEAD may omit `Origin` when Fetch Metadata is absent/`none`/`same-origin`; unsafe browser methods require an exact allowed Origin. Cross-site metadata always rejects. Explicit tokenized callback routes may omit Origin after token validation. Reject foreign/null/HTTPS/wrong-port/userinfo/path/query/suffix/duplicate/malformed inputs. Run `npx vitest run server/requestBoundary.test.ts`.
- **S1.2 Boundary wiring** — owns: `server/index.ts`, a side-effect-free token validator export in `server/cliRunner.ts`, additions to `server/cliRunner.test.ts`, and new `server/requestBoundary.integration.test.ts`. Validate callback tokens before body parsing; enforce the general boundary before APIs and both `/ws` and `/ws/term` upgrades; preserve current routing/PWA/error behavior. Run `npx vitest run server/requestBoundary.test.ts server/requestBoundary.integration.test.ts server/cliRunner.test.ts`.
- **S1.3 Browser proof** — owns: `e2e/securityBoundary.spec.ts` only. Prove production and Vite-proxy local UI/API behavior, originless same-origin GET, exact-origin mutations, callback exception, hostile read/write, and both WS paths. Run `npx playwright test e2e/securityBoundary.spec.ts`.

## Epic 2 — Exact-commit merge safety

**Call graph:** manual/auto merge → fresh PR details → QA record → pure `mergeStep` → expected-head GitHub merge or `409/requeue`.

- **S2.1 Check classification** — owns: `server/github.ts`, additions to current `server/github.test.ts`. No checks or neutral/skipped-only checks are `none`, never passing. Run `npx vitest run server/github.test.ts`.
- **S2.2 Pure gate** — owns: `server/mergeGate.ts`, additions to current `server/mergeGate.test.ts`. Require a currently `passed` QA record and matching non-null SHA; reject draft/closed, non-passing CI, requested changes, and non-clean/unknown/behind states. Never synthesize evidence. Run `npx vitest run server/mergeGate.test.ts`.
- **S2.3 Manual/auto merge parity** — owns: narrow edits to `server/swarm.ts` and new `server/manualMerge.test.ts`. Both callers fetch complete fresh PR state/checks/review/mergeability/SHA immediately before gating; backend receives expected tested SHA. Run `npx vitest run server/github.test.ts server/mergeGate.test.ts server/manualMerge.test.ts`.
- **S2.4 Branch update retest** — owns: narrow `server/swarm.ts` change and additions to `server/manualMerge.test.ts`. Updating a branch invalidates QA and requeues it; the new SHA never inherits the old pass. Run `npx vitest run server/mergeGate.test.ts server/manualMerge.test.ts server/qaOutcome.test.ts server/qaRetry.test.ts`.
- **S2.5 Adversarial fixtures** — owns: test files only. Every negative path makes zero merge calls; only one exact tested SHA can merge. Run all S2 tests.

## Epic 3 — Scheduling pause

**Call graph:** persisted setting/env force → autonomous schedule/recovery/retry/merge entry points → hold; explicit manager action → capacity gate → act.

- **S3.1 State** — owns: `shared/types.ts`, narrow defaults/load logic in `server/swarm.ts`, `server/schedulerPause.test.ts`. Required normalized boolean defaults false; persisted pause survives restart; env may force pause but never clear it. Run the focused test.
- **S3.2 UI** — owns: `client/src/ui/ManagerConsole.tsx` and new `client/src/ui/ManagerConsole.test.tsx`. Concise control using current patterns. Run `npx vitest run client/src/ui/ManagerConsole.test.tsx && npm run typecheck`.
- **S3.3 Gates** — owns: narrow `server/swarm.ts` gates and additions to `server/schedulerPause.test.ts`. Block queued dev/QA/fix/CEO starts, recovery, retries/nudges, and auto-merges; queued explicit CEO messages do not start while paused, but the manager may message a running CEO. Running sessions and housekeeping continue. Recheck pause immediately before every launch and before **automatic** merge after async preparation; explicit manual merge remains governed by Epic 2.
- **S3.4 Race tests** — owns: `server/schedulerPause.test.ts` only. Cover every autonomous path, persistence/env, pause-during-preparation, running work, manager messaging, and exactly one resume. Run the focused test plus typecheck.

## Epic 4 — Capacity with CEO reserve

**Call graph:** worker/manual/CEO start → centralized capacity policy → start or wait/429.

- **S4.1 Pure policy** — owns: `server/sessionSlots.ts`, `server/sessionSlots.test.ts`. Preparing and running work both consume capacity; cover `0/1/N`, CEO idle/busy, and boundaries. Run the focused test.
- **S4.2 Integration** — owns: narrow `server/swarm.ts` edits and new `server/sessionSlots.integration.test.ts`. Scheduler, recovery, QA/fix, direct assignment, and CEO start reserve then recheck capacity immediately before launch. A positive hard cap is never exceeded; concurrent starts cannot oversubscribe. Run `npx vitest run server/sessionSlots.test.ts server/sessionSlots.integration.test.ts server/schedulerPause.test.ts`.

## Epic 5 — Workspace and compatibility audits

- **S5.1 Workspace safety** — owns: narrow `server/workspace.ts` edits and additions to current `server/workspace.test.ts`. Graph: prepare → lock → dirty/branch-holder check → verified preservation of committed plus tracked/untracked content or refusal → reuse/rebuild. No reset/clean/force-remove path may run on dirty content; preservation failure cannot fall through. Preserve current machine, realpath, stale-lock, detached-worktree, cleanup, and Windows behavior. Tests prove dirty content survives every destructive/failure path. Run `npx vitest run server/workspace.test.ts`.
- **S5.2 Compatibility audit** — owns: additions to `server/stateFile.test.ts`; conditional narrow loader edits in `server/swarm.ts` only if the test proves a gap. Graph: load → validate known legacy role → explicit server migration or quarantine → current role. Do not port `stateCompat.ts`; never downgrade unknown roles. Run `npx vitest run server/stateFile.test.ts && npm run typecheck`.

## Epic 6 — Final adversarial gate

- **S6.1 Documentation** — owns: `docs/local-safety.md`. Threat model, loopback limitations, no public tunnel/LAN exposure, least privilege, pause/cap semantics. Review only.
- **S6.2 Verification** — owns: test fixes only; no behavior changes. Run focused tests → `npm run typecheck` → `npm test` → Playwright smoke/security/manager flows.
- **S6.3 Final approval** — owns: approval record. Code Review + Security + flagship each report `GREEN` against the assembled current SHA before merge or issue closure.

## Issue dependency order

`S0 → S1.1 → S1.2 → S1.3 → S2.1 → S2.2 → S2.3 → S2.4 → S2.5 → S3 → S4 → S5 → S6`

Every implementation issue must repeat: **Do not copy whole files from `4301211`; port only the named behavior into current upstream.**
