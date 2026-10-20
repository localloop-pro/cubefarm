import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoBackend } from './demo.ts';
import { Swarm } from './swarm.ts';
import type { PullInfo } from '../shared/types.ts';

afterEach(() => vi.useRealTimers());

function fixture(patch: Partial<PullInfo> = {}, qa: Record<string, unknown> = {}) {
  vi.useFakeTimers();
  const pr = {
    number: 1, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeState: 'CLEAN',
    checks: 'passing', headSha: 'tested-head', reviewDecision: null, failedChecks: [], pendingChecks: [], ...patch,
  } as PullInfo;
  const backend = createDemoBackend();
  const merge = vi.fn(async () => {});
  backend.mergePull = merge;
  backend.listPulls = vi.fn(async () => [pr]);
  const swarm = new Swarm(backend);
  const state = Reflect.get(swarm, 'state') as { repos: unknown[]; qa: unknown[] };
  state.repos.push({ id: 'o/r', fullName: 'o/r', defaultBranch: 'main' });
  state.qa.push({ repoId: 'o/r', prNumber: 1, status: 'passed', passedSha: 'tested-head', mergeFixes: 0, pendingSince: null, mergeRetryAt: null, alerted: false, ...qa });
  vi.spyOn(swarm, 'syncRepo').mockResolvedValue(undefined);
  return { swarm, merge };
}

describe('manager merge uses the same safety gate as auto-merge', () => {
  it('merges only the exact commit independently passed by QA', async () => {
    const { swarm, merge } = fixture();
    await swarm.mergePull('o/r', 1);
    expect(merge).toHaveBeenCalledExactlyOnceWith('o/r', 1, 'squash', 'tested-head');
  });

  for (const patch of [
    { headSha: 'untested-head' }, { isDraft: true }, { checks: 'none' }, { checks: 'pending' },
    { checks: 'failing' }, { mergeState: 'BLOCKED' }, { mergeState: 'BEHIND' },
    { mergeable: 'UNKNOWN' }, { reviewDecision: 'CHANGES_REQUESTED' }, { state: 'CLOSED' },
  ] as Partial<PullInfo>[]) {
    it(`does not call GitHub merge for ${JSON.stringify(patch)}`, async () => {
      const { swarm, merge } = fixture(patch);
      await expect(swarm.mergePull('o/r', 1)).rejects.toMatchObject({ status: 409 });
      expect(merge).not.toHaveBeenCalled();
    });
  }

  for (const qa of [{ status: 'failed' }, { passedSha: null }]) {
    it(`rejects missing QA evidence ${JSON.stringify(qa)}`, async () => {
      const { swarm, merge } = fixture({}, qa);
      await expect(swarm.mergePull('o/r', 1)).rejects.toMatchObject({ status: 409 });
      expect(merge).not.toHaveBeenCalled();
    });
  }
});
