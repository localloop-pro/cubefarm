import { describe, expect, it } from 'vitest';
import { mergeStep, type MergePull } from './mergeGate.ts';
import { retestPatch } from './swarm.ts';

const pull: MergePull = { isDraft: false, mergeable: 'MERGEABLE', mergeState: 'CLEAN', headSha: 'new456', checks: 'passing', failedChecks: [], pendingChecks: [] };
const passed = { passedSha: 'old123', mergeFixes: 0, pendingSince: null, mergeRetryAt: null, alerted: false };

describe('branch update / new head after QA passed', () => {
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
