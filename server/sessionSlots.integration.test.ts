import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { Swarm } from './swarm.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const issue = (n: number) => ({ number: n, title: `t${n}`, labels: [], body: '', url: '' });

function harness(limit: number, over: Record<string, unknown> = {}) {
  const calls = {
    startSession: vi.fn(() => ({ send: vi.fn(), stop: vi.fn() })),
    mergePull: vi.fn(async () => {}),
    prepareDesk: vi.fn(async () => '/desk'),
    releaseDesk: vi.fn(async () => {}),
    issueDetails: vi.fn(async () => ({ title: 't', body: '' })),
    prDetails: vi.fn(async () => ({
      number: 7, title: 'x', body: '', url: '', headRefName: 'swarm/x', headSha: 'aaa', isCrossRepository: false,
      closesIssues: [], state: 'OPEN', mergeable: 'MERGEABLE', mergeState: 'CLEAN', isDraft: false, reviewDecision: null, checks: 'passing',
    })),
    ...over,
  };
  const backend = new Proxy(calls, { get: (t, k) => (k in t ? (t as Any)[k] : k === 'demo' ? false : () => undefined) }) as unknown as Backend;
  const s = new Swarm(backend) as Any;
  for (const m of ['emitAgent', 'emitCeo', 'emitRepo', 'broadcast', 'save', 'toast', 'postMessage', 'buildSystemAppend', 'buildQaSystemAppend']) s[m] = () => '';
  s.sessionRuntime = () => ({});
  s.state.settings.sessionLimit = limit;
  const repo = { id: 'r1', fullName: 'o/r', defaultBranch: 'main', floor: 1, autoMerge: true, browserTesting: false, links: [] };
  s.state.repos.push(repo);
  s.repoRt.set('r1', { issues: [1, 2, 3, 4, 5, 6].map(issue), pulls: [{ number: 7, state: 'OPEN', headRefName: 'swarm/x', pendingChecks: [], failedChecks: [] }], lastSync: 1, syncing: false, cloneStatus: 'ready', lastMergedAt: null, folderSync: null, merging: false, fetchedAt: Date.now() + 1e6 });
  const agent = (id: string, role = 'developer', p: Record<string, unknown> = {}) => {
    const a = { id, name: id, repoId: role === 'ceo' ? '' : 'r1', role, task: null, status: 'idle', issueNumber: null, issueTitle: null, branch: null, prNumber: null, prUrl: null, sessionId: null, sessionCli: null, cli: '', model: '', effort: '', ...p };
    s.state.agents.push(a);
    s.agentRt.set(id, { log: [], pending: [], session: null, currentTool: null, browserUrl: null, screenshot: null, shots: [], terminal: null });
    return a;
  };
  return { s, calls, repo, agent };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('session slots in the swarm', () => {
  it('N failed preparations leave zero reservations and no slot held', async () => {
    const h = harness(3, { prepareDesk: vi.fn(async () => { throw new Error('disk full'); }) });
    const devs = ['d1', 'd2', 'd3', 'd4'].map((id) => h.agent(id));
    for (let i = 0; i < 3; i++) {
      for (const [k, a] of devs.entries()) {
        a.status = 'idle';
        void h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(k + 1)));
      }
      await flush();
      expect(h.s.slots.size).toBe(0);
      expect(h.s.running()).toBe(0);
    }
    expect(h.calls.startSession).not.toHaveBeenCalled();
  });

  it('a throw after preparation releases the slot and marks the agent errored', async () => {
    const h = harness(2);
    h.s.buildSystemAppend = () => { throw new Error('boom'); };
    const a = h.agent('d1');
    await h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(1)));
    expect(a.status).toBe('error');
    expect(h.s.slots.size).toBe(0);
    expect(h.s.running()).toBe(0);
  });

  it('concurrent starts never exceed the cap', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(3, { prepareDesk: vi.fn(async () => { await gate; return '/desk'; }) });
    const devs = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => h.agent(id));
    h.agent('ceo', 'ceo', { status: 'working' }); // busy CEO: workers may use the whole cap
    h.s.agentRt.get('ceo').session = { send: vi.fn(), stop: vi.fn() };
    const runs = devs.map((a, k) => h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(k + 1))));
    expect(h.s.running()).toBe(3);
    release();
    await Promise.all(runs);
    expect(h.calls.startSession).toHaveBeenCalledTimes(2); // 2 workers + the CEO = 3
    expect(h.s.slots.size).toBe(0);
  });

  it('with an idle CEO workers stop at limit-1 and the CEO still gets its slot', async () => {
    const h = harness(2);
    const devs = ['d1', 'd2', 'd3'].map((id) => h.agent(id));
    const ceo = h.agent('ceo', 'ceo');
    for (const [k, a] of devs.entries()) void h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(k + 1)));
    await flush();
    expect(devs.filter((a) => a.status === 'working')).toHaveLength(1);
    expect(h.s.slotsFull()).toBe(true);
    await h.s.withSlot(ceo, () => h.s.runCeoJob(ceo, { kind: 'review', at: 1 }));
    expect(ceo.status).toBe('working');
    expect(h.calls.startSession).toHaveBeenCalledTimes(2);
  });

  it('assign refuses a worker the idle CEO reserved slot', async () => {
    const h = harness(1);
    const a = h.agent('d1');
    h.agent('ceo', 'ceo');
    await expect(h.s.assign(a.id, 1)).rejects.toThrow(/session slots/);
  });

  it('a pause during preparation releases the slot', async () => {
    let h: Any;
    h = harness(1, { prepareDesk: vi.fn(async () => { h.s.setSchedulerPaused(true); return '/desk'; }) });
    const a = h.agent('d1');
    await h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(1)));
    expect(h.calls.startSession).not.toHaveBeenCalled();
    expect(a.status).toBe('idle');
    expect(h.s.slots.size).toBe(0);
    expect(h.s.running()).toBe(0);
  });

  it('a limit lowered during preparation holds the launch', async () => {
    let h: Any;
    h = harness(3, { prepareDesk: vi.fn(async () => { h.s.state.settings.sessionLimit = 1; return '/desk'; }) });
    const a = h.agent('d1');
    h.agent('d2', 'developer', { status: 'working' });
    await h.s.withSlot(a, () => h.s.runTask(a, h.repo, issue(1)));
    expect(h.calls.startSession).not.toHaveBeenCalled();
    expect(h.s.slots.size).toBe(0);
  });

  it('auto-merge takes no slot even when every slot is busy', async () => {
    const h = harness(1);
    h.agent('d1', 'developer', { status: 'working' });
    h.s.syncRepo = async () => {};
    const rec = { repoId: 'r1', prNumber: 7, status: 'passed', round: 1, devAgentId: null, qaAgentId: null, summary: null, checks: [], commentUrl: null, updatedAt: 0, issueNumber: 3, devSessionId: null, fixInstructions: null, sessionFailures: 0, mergeNote: null, testedSha: 'aaa', passedSha: 'aaa', fixReason: null, mergeFixes: 0, retests: 0, pendingSince: null, mergeRetryAt: null, alerted: false };
    h.s.state.qa.push(rec);
    expect(await h.s.advanceMerge(h.repo, rec, h.s.repoRt.get('r1').pulls[0])).toBe(true);
    expect(h.calls.mergePull).toHaveBeenCalledTimes(1);
    expect(h.s.slots.size).toBe(0);
  });
});
