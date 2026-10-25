import { describe, expect, it, vi } from 'vitest';
import type { PrDetails } from './github.ts';
import { mergeStep, type MergePull } from './mergeGate.ts';
import { freshMergeStep, manualMerge, retestPatch } from './swarm.ts';

const TESTED = 'aaa111';

function details(p: Partial<PrDetails> = {}): PrDetails {
  return {
    number: 7, title: 'x', body: '', url: '', headRefName: 'b', headSha: TESTED, isCrossRepository: false,
    closesIssues: [], state: 'OPEN', mergeable: 'MERGEABLE', mergeState: 'CLEAN', isDraft: false, reviewDecision: null,
    checks: 'passing', ...p,
  };
}

function backend(d: PrDetails) {
  return { prDetails: vi.fn(async () => d), mergePull: vi.fn(async (..._args: unknown[]) => {}) };
}

const rec = () => ({ status: 'passed', passedSha: TESTED, mergeFixes: 0, pendingSince: null, mergeRetryAt: null, alerted: false });

// The automatic path as advanceMerge runs it: one fresh detail, the gate, then a merge at the tested SHA.
async function autoMerge(b: ReturnType<typeof backend>) {
  const r = rec();
  const step = await freshMergeStep(b, 'o/r', 7, r, 'main');
  Object.assign(r, step.set);
  if (step.do === 'merge') await b.mergePull('o/r', 7, 'squash', r.passedSha);
  return step;
}

describe('manual and automatic merges', () => {
  it('both fetch one fresh detail and merge exactly once at the tested SHA', async () => {
    const m = backend(details());
    await manualMerge(m, 'o/r', 7, 'squash', rec(), 'main');
    expect(m.prDetails).toHaveBeenCalledTimes(1);
    expect(m.mergePull).toHaveBeenCalledTimes(1);
    expect(m.mergePull).toHaveBeenCalledWith('o/r', 7, 'squash', TESTED);

    const a = backend(details());
    expect((await autoMerge(a)).do).toBe('merge');
    expect(a.prDetails).toHaveBeenCalledTimes(1);
    expect(a.mergePull).toHaveBeenCalledTimes(1);
    expect(a.mergePull).toHaveBeenCalledWith('o/r', 7, 'squash', TESTED);
  });

  const refusals: [string, Partial<PrDetails>][] = [
    ['new commits', { headSha: 'bbb222' }],
    ['a draft', { isDraft: true }],
    ['failing checks', { checks: 'failing' }],
    ['pending checks', { checks: 'pending' }],
    ['a conflict', { mergeable: 'CONFLICTING' }],
    ['unknown mergeability', { mergeable: 'UNKNOWN' }],
    ['a closed PR', { state: 'CLOSED' }],
  ];
  for (const [name, p] of refusals) {
    it(`refuses ${name}: manual answers 409, auto never merges`, async () => {
      const m = backend(details(p));
      await expect(manualMerge(m, 'o/r', 7, 'squash', rec(), 'main')).rejects.toMatchObject({ status: 409 });
      expect(m.mergePull).not.toHaveBeenCalled();
      const a = backend(details(p));
      expect((await autoMerge(a)).do).not.toBe('merge');
      expect(a.mergePull).not.toHaveBeenCalled();
    });
  }

  it('auto requeues when the head moved, without merging another SHA', async () => {
    const a = backend(details({ headSha: 'bbb222' }));
    expect((await autoMerge(a)).do).toBe('requeue');
    expect(a.mergePull).not.toHaveBeenCalled();
  });

  it('manual refuses a PR QA has not passed, without asking GitHub', async () => {
    for (const r of [undefined, { ...rec(), status: 'testing' }, { ...rec(), passedSha: null }]) {
      const m = backend(details());
      await expect(manualMerge(m, 'o/r', 7, 'squash', r, 'main')).rejects.toMatchObject({ status: 409 });
      expect(m.mergePull).not.toHaveBeenCalled();
    }
  });
});

describe('branch update / new head after QA passed', () => {
  const pull: MergePull = { isDraft: false, mergeable: 'MERGEABLE', mergeState: 'CLEAN', headSha: 'new456', checks: 'passing', failedChecks: [], pendingChecks: [] };
  const passed = { passedSha: 'old123', mergeFixes: 0, pendingSince: null, mergeRetryAt: null, alerted: false };

  it('never merges a head QA did not pass: it requeues instead', () => {
    const merges: string[] = [];
    const step = mergeStep({ ...pull }, passed, Date.now(), { base: 'main', detailed: true });
    if (step.do === 'merge') merges.push(pull.headSha);
    expect(step.do).toBe('requeue');
    expect(merges).toHaveLength(0);
  });

  it('queues a new QA round and drops the old pass rather than moving it to the new head', () => {
    const patch = retestPatch({ round: 2, retests: 0 });
    expect(patch).toMatchObject({ status: 'queued', round: 3, retests: 1, passedSha: null });
    expect(patch.passedSha).not.toBe(pull.headSha);
  });
});
