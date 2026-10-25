import fs from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { STATE_FILE } from './config.ts';
import { schedulerPausedOnStart, Swarm } from './swarm.ts';

describe('schedulerPausedOnStart', () => {
  it('defaults to false', () => {
    expect(schedulerPausedOnStart(undefined, {})).toBe(false);
    expect(schedulerPausedOnStart(false, {})).toBe(false);
  });

  it('SWARM_START_PAUSED=1 forces true', () => {
    expect(schedulerPausedOnStart(false, { SWARM_START_PAUSED: '1' })).toBe(true);
    expect(schedulerPausedOnStart(false, { SWARM_START_PAUSED: '0' })).toBe(false);
  });

  it('a stored true survives a restart with the env unset or 0', () => {
    expect(schedulerPausedOnStart(true, {})).toBe(true);
    expect(schedulerPausedOnStart(true, { SWARM_START_PAUSED: '0' })).toBe(true);
  });

  it('only a real boolean true counts as stored', () => {
    expect(schedulerPausedOnStart('true', {})).toBe(false);
  });
});

describe('Swarm.setSchedulerPaused', () => {
  it('persists through the state file and survives a restart', async () => {
    vi.useFakeTimers();
    try {
      const backend = new Proxy({}, { get: () => () => undefined }) as unknown as Backend;
      const s = new Swarm(backend);
      expect(s.setSchedulerPaused(true).schedulerPaused).toBe(true);
      await (s as unknown as { writeState(): Promise<void> }).writeState();
      const saved = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as { settings: { schedulerPaused: unknown } };
      expect(saved.settings.schedulerPaused).toBe(true);
      expect(schedulerPausedOnStart(saved.settings.schedulerPaused, {})).toBe(true);
      expect(s.setSchedulerPaused(false).schedulerPaused).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

// ---------- gates ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

function harness(over: Record<string, unknown> = {}) {
  const fakeSession = { send: vi.fn(), stop: vi.fn() };
  const calls = {
    startSession: vi.fn(() => fakeSession),
    mergePull: vi.fn(async () => {}),
    updateBranch: vi.fn(async () => {}),
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
  const repo = { id: 'r1', fullName: 'o/r', defaultBranch: 'main', floor: 1, autoMerge: true, browserTesting: false, links: [] };
  s.state.repos.push(repo);
  s.repoRt.set('r1', { issues: [], pulls: [{ number: 7, state: 'OPEN', headRefName: 'swarm/x', pendingChecks: [], failedChecks: [] }], lastSync: 1, syncing: false, cloneStatus: 'ready', lastMergedAt: null, folderSync: null, merging: false, fetchedAt: Date.now() + 1e6 });
  const agent = (id: string, role = 'developer', p: Record<string, unknown> = {}) => {
    const a = { id, name: id, repoId: role === 'ceo' ? '' : 'r1', role, task: null, status: 'idle', issueNumber: null, issueTitle: null, branch: null, prNumber: null, prUrl: null, sessionId: null, sessionCli: null, cli: '', model: '', effort: '', ...p };
    s.state.agents.push(a);
    s.agentRt.set(id, { log: [], pending: [], session: null, currentTool: null, browserUrl: null, screenshot: null, shots: [], terminal: null });
    return a;
  };
  const qa = (p: Record<string, unknown> = {}) => {
    const rec = { repoId: 'r1', prNumber: 7, status: 'queued', round: 1, devAgentId: null, qaAgentId: null, summary: null, checks: [], commentUrl: null, updatedAt: 0, issueNumber: 3, devSessionId: null, fixInstructions: null, sessionFailures: 0, mergeNote: null, testedSha: 'aaa', passedSha: null, fixReason: null, mergeFixes: 0, retests: 0, pendingSince: null, mergeRetryAt: null, alerted: false, ...p };
    s.state.qa.push(rec);
    return rec;
  };
  return { s, calls, repo, agent, qa, fakeSession };
}

/** A prepareDesk that pauses the scheduler while it runs. */
const pausingPrepare = (h: () => Any) => vi.fn(async () => {
  h().s.setSchedulerPaused(true);
  return '/desk';
});

describe('scheduler pause gates', () => {
  it('a paused scheduler starts no queued dev, QA, fix or CEO work', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.s.setSchedulerPaused(true);
      h.agent('dev');
      h.agent('qa1', 'qa');
      h.agent('ceo', 'ceo');
      h.s.state.ceo.queue.push({ kind: 'review', at: 1 });
      h.qa();
      h.s.repoRt.get('r1').issues.push({ number: 3, title: 't', labels: [], body: '', url: '' });
      h.s.schedule();
      h.s.startCeoWork();
      expect(h.calls.startSession).toHaveBeenCalledTimes(0);
      expect(h.calls.prepareDesk).toHaveBeenCalledTimes(0);
      expect(h.s.state.ceo.queue).toHaveLength(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('a pause during dev desk preparation holds the issue: desk kept, nothing launched', async () => {
    let h: Any;
    h = harness({ prepareDesk: pausingPrepare(() => h) });
    const a = h.agent('dev');
    await h.s.runTask(a, h.repo, { number: 3, title: 't', labels: [], body: '', url: '' });
    expect(h.calls.prepareDesk).toHaveBeenCalledTimes(1);
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(h.calls.releaseDesk).toHaveBeenCalledTimes(1); // only the pre-prepare reset, not after the hold
    expect(a.status).toBe('idle');
  });

  it('a pause during QA preparation requeues the PR and launches nothing', async () => {
    let h: Any;
    h = harness({ prepareDesk: pausingPrepare(() => h) });
    const a = h.agent('qa1', 'qa');
    const rec = h.qa();
    await h.s.runQa(a, h.repo, rec);
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(rec.status).toBe('queued');
  });

  it('a pause during fix preparation leaves the fix pending and launches nothing', async () => {
    let h: Any;
    h = harness({ prepareDesk: pausingPrepare(() => h) });
    const a = h.agent('dev');
    const rec = h.qa({ status: 'failed' });
    await h.s.runFix(a, h.repo, rec);
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(rec.status).toBe('failed');
  });

  it('a pause while a CEO job prepares puts it back in the queue', async () => {
    const h = harness();
    const a = h.agent('ceo', 'ceo');
    const orig = h.s.appendLog.bind(h.s);
    let first = true;
    h.s.appendLog = (ag: Any, e: Any) => {
      if (first) h.s.setSchedulerPaused(true); // lands before the async mkdir finishes
      first = false;
      return orig(ag, e);
    };
    await h.s.runCeoJob(a, { kind: 'review', at: 1 });
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(h.s.state.ceo.queue).toHaveLength(1);
    expect(h.s.state.ceo.job).toBeNull();
  });

  it('restart recovery does not relaunch while paused', () => {
    const h = harness();
    h.s.setSchedulerPaused(true);
    const a = h.agent('dev', 'developer', { status: 'stopped', task: 'issue', sessionId: 's1', branch: 'swarm/x' });
    h.s.recover([a]);
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(a.status).toBe('stopped');
  });

  it('the missing-PR nudge does nothing while paused', () => {
    const h = harness();
    h.s.setSchedulerPaused(true);
    const a = h.agent('dev', 'developer', { status: 'done', task: 'issue', issueNumber: 3, sessionId: 's1', branch: 'swarm/x' });
    h.s.noPullRequest(a, h.repo);
    expect(h.calls.startSession).toHaveBeenCalledTimes(0);
    expect(h.s.nudged.size).toBe(0);
    expect(a.issueNumber).toBe(3);
  });

  it('auto-merge does not run while paused', async () => {
    const h = harness();
    h.s.setSchedulerPaused(true);
    h.qa({ status: 'passed', passedSha: 'aaa' });
    await h.s.advanceMerges(h.repo);
    expect(h.calls.prDetails).toHaveBeenCalledTimes(0);
    expect(h.calls.mergePull).toHaveBeenCalledTimes(0);
  });

  it('auto-merge rechecks the pause right before mergePull', async () => {
    let h: Any;
    const ready = harness().calls.prDetails;
    h = harness({ prDetails: vi.fn(async () => { h.s.setSchedulerPaused(true); return ready(); }) });
    const rec = h.qa({ status: 'passed', passedSha: 'aaa' });
    expect(await h.s.advanceMerge(h.repo, rec, h.s.repoRt.get('r1').pulls[0])).toBe(false);
    expect(h.calls.mergePull).toHaveBeenCalledTimes(0);

    const u = harness(); // control: unpaused, the same PR merges
    const rec2 = u.qa({ status: 'passed', passedSha: 'aaa' });
    u.s.syncRepo = async () => {};
    expect(await (u.s as Any).advanceMerge(u.repo, rec2, u.s.repoRt.get('r1').pulls[0])).toBe(true);
    expect(u.calls.mergePull).toHaveBeenCalledTimes(1);
  });

  it('a manager message reaches a running CEO; an idle paused CEO only queues it', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.s.setSchedulerPaused(true);
      const a = h.agent('ceo', 'ceo');
      h.s.ceo = () => a;
      await h.s.messageCeo('hello');
      vi.runOnlyPendingTimers();
      expect(h.calls.startSession).toHaveBeenCalledTimes(0);
      expect(h.s.state.ceo.queue).toHaveLength(1);

      h.s.agentRt.get('ceo').session = h.fakeSession;
      await h.s.messageCeo('still there?');
      expect(h.fakeSession.send).toHaveBeenCalledTimes(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('running sessions keep running and housekeeping still ticks while paused', () => {
    const h = harness();
    const a = h.agent('dev', 'developer', { status: 'working' });
    h.s.agentRt.get('dev').session = h.fakeSession;
    const tick = vi.fn();
    h.s.tickUsage = tick;
    h.s.setSchedulerPaused(true);
    h.s.schedule();
    expect(tick).toHaveBeenCalled();
    expect(h.fakeSession.stop).not.toHaveBeenCalled();
    expect(a.status).toBe('working');
  });
});
