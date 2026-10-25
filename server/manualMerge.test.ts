import { describe, expect, it, vi } from 'vitest';
import type { PrDetails } from './github.ts';
import { freshMergeStep, manualMerge } from './swarm.ts';

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

// ---------- adversarial matrix: every refusal merges zero times, on both paths ----------

describe('adversarial merge matrix', () => {
  const prCases: [string, Partial<PrDetails>][] = [
    ['a closed PR', { state: 'CLOSED' }],
    ['a merged PR', { state: 'MERGED' }],
    ['a draft', { isDraft: true }],
    ['requested changes', { reviewDecision: 'CHANGES_REQUESTED' }],
    ['pending checks', { checks: 'pending' }],
    ['failing checks', { checks: 'failing' }],
    ['no checks (none, or neutral/skipped only)', { checks: 'none' }],
    ['mergeState BLOCKED', { mergeState: 'BLOCKED' }],
    ['mergeState BEHIND', { mergeState: 'BEHIND' }],
    ['mergeState DIRTY', { mergeState: 'DIRTY' }],
    ['mergeState UNKNOWN', { mergeState: 'UNKNOWN', mergeable: 'UNKNOWN' }],
    ['head moved between QA pass and merge', { headSha: 'bbb222' }],
  ];
  for (const [name, p] of prCases) {
    it(`manual: ${name} answers 409 with a reason and never merges`, async () => {
      const m = backend(details(p));
      await expect(manualMerge(m, 'o/r', 7, 'squash', rec(), 'main')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/can't be merged: \S/) });
      expect(m.mergePull).toHaveBeenCalledTimes(0);
    });
    it(`auto: ${name} gives a non-merge step and never merges`, async () => {
      const a = backend(details(p));
      const step = await autoMerge(a);
      expect(step.do).not.toBe('merge');
      expect(step.do === 'wait' ? step.note : step.do).toBeTruthy(); // the refusal is surfaced, not silent
      expect(a.mergePull).toHaveBeenCalledTimes(0);
    });
  }

  const qaCases: [string, (Omit<ReturnType<typeof rec>, 'passedSha'> & { passedSha: string | null }) | undefined][] = [
    ['QA record missing', undefined],
    ['QA failed', { ...rec(), status: 'failed', passedSha: null }],
    ['QA passed on another SHA', { ...rec(), passedSha: 'ccc333' }],
  ];
  for (const [name, r] of qaCases) {
    it(`manual: ${name} answers 409 and never merges`, async () => {
      const m = backend(details());
      await expect(manualMerge(m, 'o/r', 7, 'squash', r, 'main')).rejects.toMatchObject({ status: 409 });
      expect(m.mergePull).toHaveBeenCalledTimes(0);
    });
    it(`auto: ${name} never merges`, async () => {
      const a = backend(details());
      const step = r && r.status === 'passed' ? await freshMergeStep(a, 'o/r', 7, r, 'main') : null;
      if (step?.do === 'merge') await a.mergePull('o/r', 7, 'squash', r!.passedSha);
      expect(step?.do ?? 'not passed').not.toBe('merge');
      expect(a.mergePull).toHaveBeenCalledTimes(0);
    });
  }

  it('prDetails throwing reaches neither merge on either path', async () => {
    const boom = () => ({ prDetails: vi.fn(async (): Promise<PrDetails> => { throw new Error('gh down'); }), mergePull: vi.fn(async (..._a: unknown[]) => {}) });
    const m = boom();
    await expect(manualMerge(m, 'o/r', 7, 'squash', rec(), 'main')).rejects.toThrow('gh down');
    expect(m.mergePull).toHaveBeenCalledTimes(0);
    const a = boom();
    await expect(freshMergeStep(a, 'o/r', 7, rec(), 'main')).rejects.toThrow('gh down');
    expect(a.mergePull).toHaveBeenCalledTimes(0);
  });

  it('exactly one positive case per path merges once at rec.passedSha', async () => {
    const m = backend(details());
    await manualMerge(m, 'o/r', 7, 'squash', rec(), 'main');
    expect(m.mergePull.mock.calls).toEqual([['o/r', 7, 'squash', rec().passedSha]]);
    const a = backend(details());
    await autoMerge(a);
    expect(a.mergePull.mock.calls).toEqual([['o/r', 7, 'squash', rec().passedSha]]);
  });
});
