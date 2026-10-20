import { describe, expect, it } from 'vitest';
import { checkRunOf, checksOf, readTwice, toPrDetails } from './github.ts';

describe('readTwice', () => {
  it('tries a failed read once more', async () => {
    let calls = 0;
    const read = async () => {
      calls++;
      if (calls === 1) throw new Error('gh pr list -R failed: timed out after 60 s');
      return [1, 2];
    };
    await expect(readTwice(read, 0)).resolves.toEqual([1, 2]);
    expect(calls).toBe(2);
  });

  it('gives up with the second error', async () => {
    let calls = 0;
    const read = async () => {
      calls++;
      throw new Error(`failure ${calls}`);
    };
    await expect(readTwice(read, 0)).rejects.toThrow('failure 2');
    expect(calls).toBe(2);
  });
});

describe('checkRunOf', () => {
  const run = (startedAt: string, completedAt: string | undefined, status = 'COMPLETED') => ({ name: 'build', status, conclusion: completedAt ? 'SUCCESS' : '', startedAt, completedAt });

  it('times the check runs from the first start to the last finish', () => {
    expect(checkRunOf([run('2026-10-04T17:38:00Z', '2026-10-04T17:38:42Z'), run('2026-10-04T17:38:08Z', '2026-10-04T17:41:01Z')])).toEqual({
      ms: (3 * 60 + 1) * 1000,
      doneAt: Date.parse('2026-10-04T17:41:01Z'),
    });
  });

  it('has nothing while a check still runs, without times, or without checks', () => {
    expect(checkRunOf([run('2026-10-04T17:38:00Z', '2026-10-04T17:38:42Z'), run('2026-10-04T17:38:08Z', undefined, 'IN_PROGRESS')])).toBeNull();
    expect(checkRunOf([{ context: 'Vercel', state: 'SUCCESS' }])).toBeNull();
    expect(checkRunOf([])).toBeNull();
    expect(checkRunOf(null)).toBeNull();
  });
});

describe('checksOf', () => {
  it('is none without checks, never passing', () => {
    expect(checksOf(null)).toBe('none');
    expect(checksOf([])).toBe('none');
  });

  it('is none when every check was neutral or skipped', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SKIPPED' }, { name: 'b', status: 'COMPLETED', conclusion: 'NEUTRAL' }])).toBe('none');
  });

  it('passes once one check succeeded beside skipped ones', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SKIPPED' }, { name: 'b', status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('passing');
    expect(checksOf([{ context: 'vercel', state: 'SUCCESS' }])).toBe('passing');
  });

  it('fails or waits before anything else', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SKIPPED' }, { name: 'b', status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('failing');
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SKIPPED' }, { name: 'b', status: 'IN_PROGRESS' }])).toBe('pending');
  });
});

describe('toPrDetails', () => {
  const raw = {
    number: 7,
    title: 't',
    body: 'b',
    url: 'u',
    headRefName: 'swarm/x',
    headRefOid: 'abc123',
    isCrossRepository: false,
    closingIssuesReferences: [{ number: 4 }],
    state: 'OPEN' as const,
    isDraft: true,
    reviewDecision: 'APPROVED',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SKIPPED' }],
  };

  it('fills state, draft, review, head, mergeability and checks from one view', () => {
    expect(toPrDetails(raw)).toMatchObject({
      state: 'OPEN',
      isDraft: true,
      reviewDecision: 'APPROVED',
      headSha: 'abc123',
      mergeable: 'MERGEABLE',
      mergeState: 'CLEAN',
      checks: 'none',
      closesIssues: [4],
    });
  });

  it('reads an empty review decision as null and a missing rollup as none', () => {
    expect(toPrDetails({ ...raw, reviewDecision: '', statusCheckRollup: null, mergeStateStatus: '' })).toMatchObject({ reviewDecision: null, checks: 'none', mergeState: 'UNKNOWN' });
  });
});
