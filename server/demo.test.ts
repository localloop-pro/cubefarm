import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo.ts';

describe('demo prDetails', () => {
  it('returns the complete detail the merge gate needs', async () => {
    const b = createDemoBackend();
    const repo = (await b.listMyRepos())[0];
    expect(repo).toBeDefined();
    const pull = (await b.listPulls(repo!.nameWithOwner))[0];
    if (!pull) return;
    const d = await b.prDetails(repo!.nameWithOwner, pull.number);
    expect(d).toMatchObject({ isDraft: pull.isDraft, checks: pull.checks, reviewDecision: null, headSha: pull.headSha });
  });
});
