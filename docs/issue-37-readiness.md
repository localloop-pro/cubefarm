# Issue #37: microphone diagnostics readiness

Status: blocked; microphone acceptance is not confirmed.

PR #58 is a non-closing tracking report, not the implementation of #37. Its
description must use a non-closing reference so merging this report leaves #37 open.
Draft status is not a safeguard against the office's automatic merge process.

## Checked revisions

- Assigned base `main`: `f04000cbd8d59503418bf8d37f171230ebaed5bc`.
- Voice integration: `codex/integrate-safety-upstream` at `a23c2a6d38725286f11f1435cdfecee676006f96`.
- [PR #40](https://github.com/localloop-pro/cubefarm/pull/40) merged diagnostics commit `9f3790bc9766b0bf67fe5471194f16cececa13e8` into the voice integration branch, not `main`.

The seven paths named by #37 are absent from `main`, including `e2e/mic.spec.ts`.
The integration branch differs by 756 files, 113,845 added lines and 3,897 removed lines.
Its microphone imports also require absent voice settings/types, controls, music ducking,
audio preferences/chimes, clip limits, and transcription infrastructure. Copying the
diagnostic files alone would leave disconnected code or fail typechecking.

## Remaining implementation and validation plan

1. Land the voice stack through its integration review, preserving the safety work on
   `main`. The integration approval remains RED in `docs/safety-integration-approval.md`.
2. Complete the following gaps in the already merged PR #40 implementation:
   - `MicButton.statusLine()` returns an empty string for `state === 'error'`, so the
     startup timeout still removes the status bubble. Keep the error visible there.
   - Recognition `onerror` only stores an error until `onend`. Test refusal without an
     `onend` event and ensure the blocked explanation appears within two seconds.
   - `handsFree.test.ts` tests a supplied `enabled: false`, but does not exercise
     `mic.ts`'s real `room().enabled` calculation with `micAllowed === false`.
   - Add permission-denied, missing-device/API, permission-wait/timeout and Mic check
     success/failure browser coverage alongside the existing insecure-context test.
3. Run the checks and browser acceptance against the resulting implementation SHA.
   Neither checked branch defines `npm run verify` or a lint script; agree on that
   aggregate gate or explicitly report the existing individual commands.
4. Keep #37 open until its implementation and browser acceptance are complete.

Assumption: the assigned microphone fix does not authorize importing the entire
unapproved upstream integration as an incidental prerequisite. This report changes
no product code and makes no microphone security or acceptance claim.

## Validation on the assigned base (2026-10-25)

- `npm run typecheck`: passed.
- `npm test`: 35 files passed, 409 tests passed, 1 todo.
- `npm run build`: passed; existing bundle-size warning.
- Demo: `SWARM_HOME="$PWD/.issue-37-demo" SWARM_PORT=5870 node --import tsx server/index.ts --demo`.
  Startup explicitly reported DEMO MODE and an isolated state path. Server stopped
  after validation and disposable state removed.
- Playwright: navigated to `http://localhost:5870`, entered the office, opened the
  phone with P, captured its accessibility snapshot and screenshot. The message box
  and Send rendered, with zero `.mic-btn` elements and no `window.__swarmMic`.
  Browser reported secure context, recognition support and mediaDevices present.
  Console: zero errors, three warnings. Screenshot is local-only at
  `test-results/issue-37-main-phone.png` (ignored artifact).
- Mic e2e: unavailable on this base; no mic test file or implementation to exercise.
- Adversarial microphone checks: unverified; there is no microphone flow on this base.
  No permission request, audio capture, transcript logging or provider request was added.

The Featured spec, plan, todo and completion database named by the generic workflow
instructions are absent from this repository. This report records the active plan
and blocker without inventing a completion database schema or marking the issue done.
