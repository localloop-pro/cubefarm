import { describe, expect, it } from 'vitest';
import type { PrDetails } from './github.ts';
import { gatedMerge } from './swarm.ts';

const TESTED = 'a'.repeat(40);

const details = (over: Partial<PrDetails> = {}): PrDetails => ({
  number: 7,
  title: 'A change',
  body: 'Closes #3',
  url: 'https://github.com/o/r/pull/7',
  headRefName: 'swarm/issue-3',
  headSha: TESTED,
  isCrossRepository: false,
  closesIssues: [3],
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  mergeState: 'CLEAN',
  checks: 'passing',
  checkNames: ['CI / build'],
  failedChecks: [],
  pendingChecks: [],
  ...over,
});

function fakeBackend(pr: PrDetails, mergeError?: string) {
  const calls = { details: 0, merges: [] as { method: string; sha?: string }[] };
  return {
    calls,
    backend: {
      prDetails: async () => (calls.details++, pr),
      mergePull: async (_f: string, _n: number, method: 'squash' | 'merge' | 'rebase', sha?: string) => {
        calls.merges.push({ method, sha });
        if (mergeError) throw new Error(mergeError);
      },
    },
  };
}

const passed = { status: 'passed', passedSha: TESTED };
const paths = { manual: ['squash'], auto: ['squash', 'merge', 'rebase'] } as const;

describe('gatedMerge (manual and auto merge paths)', () => {
  for (const [path, methods] of Object.entries(paths)) {
    it(`${path}: merges once with QA's tested SHA after one fresh detail`, async () => {
      const { backend, calls } = fakeBackend(details());
      const res = await gatedMerge(backend, 'o/r', 7, passed, methods);
      expect(res).toMatchObject({ ok: true, error: '' });
      expect(calls.details).toBe(1);
      expect(calls.merges).toEqual([{ method: 'squash', sha: TESTED }]);
    });

    it(`${path}: never merges when the gate refuses`, async () => {
      const refusals: [Parameters<typeof gatedMerge>[3], Partial<PrDetails>, string][] = [
        [passed, { headSha: 'b'.repeat(40) }, 'head-moved'],
        [{ status: 'failed', passedSha: TESTED }, {}, 'not-passed'],
        [{ status: null, passedSha: null }, {}, 'not-passed'],
        [passed, { checks: 'pending' }, 'checks-not-passing'],
        [passed, { isDraft: true }, 'draft'],
        [passed, { state: 'MERGED' }, 'not-open'],
        [passed, { reviewDecision: 'CHANGES_REQUESTED' }, 'changes-requested'],
        [passed, { mergeState: 'BLOCKED' }, 'merge-state'],
      ];
      for (const [rec, over, reason] of refusals) {
        const { backend, calls } = fakeBackend(details(over));
        expect(await gatedMerge(backend, 'o/r', 7, rec, methods)).toMatchObject({ ok: false, reason });
        expect(calls.details).toBe(1);
        expect(calls.merges).toEqual([]);
      }
    });
  }

  it('reports GitHub refusing the merge without retrying under a different SHA', async () => {
    const { backend, calls } = fakeBackend(details(), 'Head branch was modified');
    expect(await gatedMerge(backend, 'o/r', 7, passed, paths.auto)).toMatchObject({ ok: true, error: 'Head branch was modified' });
    expect(calls.merges).toEqual([{ method: 'squash', sha: TESTED }]);
  });

  it('tries the next method only when one is turned off, always with the tested SHA', async () => {
    const { backend, calls } = fakeBackend(details(), 'Squash merges are not allowed on this repository');
    await gatedMerge(backend, 'o/r', 7, passed, paths.auto);
    expect(calls.merges.map((m) => m.sha)).toEqual([TESTED, TESTED, TESTED]);
  });
});
