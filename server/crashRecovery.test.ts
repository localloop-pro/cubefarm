import fs from 'node:fs/promises';
import path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';

// Each worker gets a private on-disk office, including screens, CEO notes and desks.
// No mock of serialization, loading, reconciliation, recovery, scheduling or merge gates.
const location = vi.hoisted(() => ({ root: '' }));
vi.mock('./config.ts', async (original) => {
  const config = await original<typeof import('./config.ts')>();
  const disk = await import('node:fs');
  const paths = await import('node:path');
  location.root = disk.mkdtempSync(paths.resolve('node_modules/.cache-recovery-'));
  return { ...config, HOME_DIR: location.root, WORKSPACE_ROOT: paths.join(location.root, 'desks'), STATE_FILE: paths.join(location.root, 'state.json'), PORT: 0, DEMO: false };
});
import { STATE_FILE } from './config.ts';
import { Swarm } from './swarm.ts';

// Private access is intentional: inject loss at the checkpoint boundary without a production fault API.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const repoId = 'demo-co/pixel-todo';
const branch = 'swarm/issue-3-ada';
const issue = { number: 3, title: 'Durable task', labels: [], body: '', url: 'https://example.invalid/issues/3' };
const pull = (patch: Record<string, unknown> = {}) => ({ number: 7, title: 'Recovered PR', body: '', url: 'https://example.invalid/pull/7', headRefName: branch, headSha: 'aaa', baseRefName: 'main', isCrossRepository: false, closesIssues: [3], state: 'OPEN', mergeable: 'MERGEABLE', mergeState: 'CLEAN', isDraft: false, reviewDecision: null, checks: 'passing', pendingChecks: [], failedChecks: [], mergedAt: null, ...patch });
const reports: { scenario: string; milliseconds: number }[] = [];
let remote: Any;
let calls: Any;
let backend: Backend;

function instance(): Any { return new Swarm(backend); }
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); await new Promise<void>((r) => setImmediate(r)); }
async function restart(scenario: string) {
  // Abrupt loss: discard memory/timers, never shutdown() (which would checkpoint).
  vi.clearAllTimers();
  const start = performance.now();
  const s = instance();
  await s.init();
  await settle();
  reports.push({ scenario, milliseconds: Math.round((performance.now() - start) * 100) / 100 });
  return s;
}
async function seed() {
  const s = instance();
  s.state.repos.push({ id: repoId, fullName: repoId, description: '', url: '', defaultBranch: 'main', floor: 1, color: '#123456', autoAssign: false, autoMerge: false, browserTesting: false, links: [], mission: '', summary: '', qaBrief: '', localPath: null, preview: { command: null, env: {} } });
  s.repoRt.set(repoId, { issues: [issue], pulls: [], lastSync: 1, syncing: false, cloneStatus: 'ready', lastMergedAt: null, merging: false });
  const a = s.hireAgent(repoId, { name: 'Ada' });
  s.state.settings.runtime = 'sdk';
  s.state.settings.ceoHeartbeatMin = 0;
  s.state.settings.hiring = 'approve';
  s.state.settings.setupDone = true;
  s.state.settings.tutorialStep = -1;
  s.state.settings.sessionLimit = 2; // includes the CEO's reserved slot
  s.state.requests.push({ id: 'owner-gate', kind: 'hire', repoId, status: 'pending', name: 'Pending', role: 'dev', title: 'Developer', specialty: '', brief: '', reason: 'Owner approval required', model: '', effort: '', look: 'feminine', color: '#123456', hair: '#222222', skin: '#bb9988', note: '', createdAt: 1, decidedAt: null, decidedBy: null, agentId: null });
  await s.writeState();
  return { s, a: s.state.agents.find((x: Any) => x.id === a.id), repo: s.state.repos[0] };
}
function record(s: Any, patch: Record<string, unknown> = {}) {
  const q = { repoId, prNumber: 7, status: 'testing', round: 1, devAgentId: null, qaAgentId: null, summary: 'saved evidence', checks: [], commentUrl: null, updatedAt: 1, issueNumber: 3, devSessionId: null, fixInstructions: null, sessionFailures: 0, mergeNote: null, testedSha: 'aaa', passedSha: null, fixReason: null, mergeFixes: 0, retests: 0, pendingSince: null, mergeRetryAt: null, alerted: false, ...patch };
  s.state.qa.push(q);
  return q;
}
function task(a: Any, kind = 'issue', patch = {}) {
  Object.assign(a, { status: 'working', task: kind, issueNumber: 3, issueTitle: issue.title, branch, sessionId: 'saved-session', sessionCli: 'claude', prNumber: kind === 'issue' ? null : 7, ...patch });
}
function gates(s: Any) {
  expect(s.state.settings).toMatchObject({ hiring: 'approve', sessionLimit: 2 });
  expect(s.state.requests).toContainEqual(expect.objectContaining({ id: 'owner-gate', status: 'pending' }));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] });
  await fs.rm(STATE_FILE, { force: true });
  remote = { pulls: [], unavailable: false, merges: 0, events: [] };
  calls = {
    demo: false, terminals: false,
    user: async () => 'fake-owner', reconnectClis: async () => [], hooksReady: () => {}, detectClis: async () => [],
    ensureClone: async () => {}, setLocalPath: () => {}, releaseDesk: vi.fn(async () => {}),
    mainDir: () => path.join(location.root, 'main'), deskDir: () => path.join(location.root, 'dirty-desk'),
    prepareDesk: vi.fn(async () => path.join(location.root, 'dirty-desk')),
    listIssues: async () => [issue],
    listPulls: vi.fn(async () => { remote.events.push('read-pulls'); if (remote.unavailable) throw new Error('fake offline'); return structuredClone(remote.hideFromBoard ? [] : remote.pulls); }),
    prDetails: vi.fn(async () => { remote.events.push('read-details'); if (remote.unavailable) throw new Error('fake offline'); return structuredClone(remote.pulls[0]); }),
    prForBranch: vi.fn(async () => { remote.events.push('read-branch'); if (remote.branchUnavailable) throw new Error('fake branch read offline'); return remote.pulls[0] ?? null; }),
    issueDetails: async () => ({ title: issue.title, body: '' }),
    mergePull: vi.fn(async () => { remote.events.push('merge'); remote.merges++; remote.pulls[0].state = 'MERGED'; remote.pulls[0].mergedAt = new Date().toISOString(); throw new Error('ack lost'); }),
    startSession: vi.fn((opts: Any, cb: Any) => { remote.events.push('start'); cb.sessionId('saved-session'); return { send: vi.fn(), stop: vi.fn(), opts }; }),
    syncMain: async () => null,
    previews: { hasDefault: async () => false },
    office: { head: async () => null, takeLastUpdate: async () => null, isOwnFolder: () => false, launcher: false },
  };
  backend = new Proxy(calls, { get: (obj, key) => { if (key in obj) return obj[key]; throw new Error(`Unexpected backend access: ${String(key)}`); } }) as Backend;
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => {
  console.info('Recovery matrix timings (local process-loss simulation):', JSON.stringify(reports));
  await fs.rm(location.root, { recursive: true, force: true });
});

async function killedOffice(mode: string): Promise<Any> {
  const child: ChildProcess = fork(path.resolve('server/fixtures/crashOffice.ts'), [mode], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, SWARM_HOME: location.root, SWARM_PORT: '0', SWARM_DEMO: '0', SWARM_START_PAUSED: '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let errors = '';
  child.stderr?.on('data', (chunk) => { errors += chunk; });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`child timeout: ${errors}`)), 15_000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`child exited ${code}: ${errors}`)); });
      child.once('message', (msg) => { clearTimeout(timer); resolve(msg); });
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGKILL');
      await exited;
    }
  }
}

describe('on-disk crash/restart matrix', () => {
  it.each(['uncheckpointed', 'checkpoint'])('SIGKILL subprocess at %s boundary then load in a fresh process', async (mode) => {
    const { a } = await seed();
    vi.clearAllTimers(); vi.useRealTimers();
    await killedOffice(mode);
    const start = performance.now();
    const restored = await killedOffice('load');
    reports.push({ scenario: `SIGKILL:${mode}`, milliseconds: Math.round(performance.now() - start) });
    const agent = restored.snapshot.agents.find((x: Any) => x.id === a.id);
    expect(agent).toMatchObject(mode === 'checkpoint' ? { task: 'issue', status: 'working', issueNumber: 3 } : { task: null, status: 'idle' });
    expect(restored.starts).toBe(mode === 'checkpoint' ? 1 : 0);
  });

  it.each(['issue', 'fix', 'qa'])('%s before checkpoint restores only the previous durable state', async (kind) => {
    const { s, a } = await seed();
    task(a, kind);
    s.save(); // crash before the 1.5s timer fires
    const b = await restart(`${kind}:before-checkpoint`);
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'idle', task: null });
    expect(calls.startSession).not.toHaveBeenCalled();
    gates(b);
  });

  it.each(['issue', 'fix'])('%s after checkpoint resumes exactly one writer, preserving dirty work and evidence', async (kind) => {
    const { s, a } = await seed();
    task(a, kind);
    if (kind === 'fix') { remote.pulls = [pull()]; record(s, { status: 'fixing', devAgentId: a.id }); }
    await fs.mkdir(calls.deskDir(), { recursive: true });
    const dirty = path.join(calls.deskDir(), 'uncommitted.txt');
    await fs.writeFile(dirty, 'do not reset');
    s.appendLog(a, [{ kind: 'system', text: 'checkpoint evidence' }]);
    await s.writeState();
    const b = await restart(`${kind}:after-checkpoint`);
    b.schedule(); b.schedule(); await settle();
    expect(calls.startSession).toHaveBeenCalledTimes(1);
    expect(calls.startSession.mock.calls[0][0]).toMatchObject({ resumeSessionId: 'saved-session', cwd: calls.deskDir() });
    expect(await fs.readFile(dirty, 'utf8')).toBe('do not reset');
    expect(b.snapshot().agents.find((x: Any) => x.id === a.id).log).toContainEqual(expect.objectContaining({ text: 'checkpoint evidence' }));
    expect(calls.prepareDesk).not.toHaveBeenCalled();
    expect(b.issueTaken(b.state.repos[0], 3)).toBe(true);
    gates(b);
  });

  it('durable interrupted QA is requeued, never accepted from its old head', async () => {
    const { s, a } = await seed();
    a.role = 'qa'; task(a, 'qa');
    record(s, { qaAgentId: a.id });
    s.state.settings.schedulerPaused = true;
    remote.pulls = [pull({ headSha: 'bbb' })];
    await s.writeState();
    const b = await restart('qa:after-checkpoint');
    expect(b.state.qa[0]).toMatchObject({ status: 'queued', passedSha: null, summary: 'saved evidence' });
    expect(calls.startSession).not.toHaveBeenCalled();
    b.setSchedulerPaused(false); b.schedule(); b.schedule(); await settle();
    expect(calls.startSession).toHaveBeenCalledTimes(1);
    expect(b.state.qa[0]).toMatchObject({ status: 'testing', testedSha: 'bbb', passedSha: null });
    expect(calls.mergePull).not.toHaveBeenCalled();
    gates(b);
  });

  it('assignment interrupted during desk preparation stays held without losing its owner', async () => {
    const { s, a } = await seed();
    calls.prepareDesk.mockImplementation(() => new Promise(() => {})); // simulated blocked external prepare
    await s.assign(a.id, 3); await settle();
    expect(a.status).toBe('preparing');
    await s.writeState();
    const b = await restart('assignment:after-checkpoint-before-session');
    b.state.repos[0].autoAssign = true;
    b.schedule(); b.schedule(); await settle();
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'stopped', task: 'issue', issueNumber: 3, branch });
    expect(b.issueTaken(b.state.repos[0], 3)).toBe(true);
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(calls.prepareDesk).toHaveBeenCalledTimes(1);
    gates(b);
  });

  it('PR created before acknowledgement is discovered before any writer resumes', async () => {
    const { s, a } = await seed(); task(a); await s.writeState();
    remote.pulls = [pull()]; // fake agent's PR creation succeeded; no local acknowledgement/checkpoint
    const b = await restart('PR:external-outcome-before-ack');
    expect(remote.events[0]).toBe('read-pulls');
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'done', prNumber: 7, task: 'issue' });
    expect(b.state.qa).toHaveLength(1);
    expect(b.state.qa[0].status).toBe('queued');
    expect(remote.pulls).toHaveLength(1);
    gates(b);
  });

  it('an unavailable remote holds uncertain issue work instead of blindly resuming', async () => {
    const { s, a } = await seed(); task(a); await s.writeState(); remote.unavailable = true;
    const b = await restart('PR:remote-unavailable');
    b.schedule(); await settle();
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'stopped', issueNumber: 3 });
    expect(b.state.qa).toHaveLength(0);
  });

  it.each(['CLOSED', 'MERGED'])('uncertain PR outcome reconciles %s without reopening work', async (state) => {
    const { s, a } = await seed(); task(a); await s.writeState();
    remote.pulls = [pull({ state })];
    const b = await restart(`PR:external-outcome:${state}`);
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'idle', task: null });
    expect(b.state.qa).toHaveLength(0);
    expect(remote.merges).toBe(0);
  });

  it.each([
    ['CLOSED', true], ['MERGED', true], ['CLOSED', false], ['MERGED', false],
  ])('fix recovery reconciles %s (hidden from board: %s) without replay or evidence loss', async (state, hideFromBoard) => {
    const { s, a } = await seed();
    task(a, 'fix');
    const evidence = record(s, { status: 'fixing', devAgentId: a.id, commentUrl: 'https://example.invalid/evidence', checks: [{ name: 'saved check', result: 'fail' }] });
    await fs.mkdir(calls.deskDir(), { recursive: true });
    const dirty = path.join(calls.deskDir(), 'terminal-fix.txt');
    await fs.writeFile(dirty, 'preserve interrupted fix');
    await s.writeState();
    remote.pulls = [pull({ state })]; remote.hideFromBoard = hideFromBoard;
    const b = await restart(`fix:terminal:${state}:hidden=${hideFromBoard}`);
    if (hideFromBoard) {
      expect(calls.prDetails).toHaveBeenCalledWith(repoId, 7);
      expect(remote.events).toEqual(['read-pulls', 'read-details']);
    }
    b.schedule(); b.schedule(); await settle();
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(calls.prepareDesk).not.toHaveBeenCalled();
    expect(calls.mergePull).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'idle', task: null });
    expect(b.state.qa).toHaveLength(0);
    expect(await fs.readFile(dirty, 'utf8')).toBe('preserve interrupted fix');
    const log = b.snapshot().agents.find((x: Any) => x.id === a.id).log;
    expect(log).toContainEqual(expect.objectContaining({ text: `Recovery reconciled fix PR #7: ${state}. No fix session replayed.` }));
    expect(log).toContainEqual(expect.objectContaining({ text: `Recovery retained QA evidence for PR #7: ${JSON.stringify(evidence)}` }));
    gates(b);
    await b.writeState();
    const c = await restart(`fix:terminal:${state}:second-restart:hidden=${hideFromBoard}`);
    expect(c.state.qa).toHaveLength(0);
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(c.snapshot().agents.find((x: Any) => x.id === a.id).log).toEqual(log);
  });

  it('a PR outside the bounded board is found by targeted remote lookup before replay', async () => {
    const { s, a } = await seed(); task(a); await s.writeState();
    remote.pulls = [pull()]; remote.hideFromBoard = true;
    const b = await restart('PR:outside-board-window');
    expect(remote.events).toEqual(['read-pulls', 'read-branch', 'read-details']);
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id).prNumber).toBe(7);
    expect(b.state.qa[0].status).toBe('queued');
  });

  it('failed targeted read holds the task even when the board fetch succeeded', async () => {
    const { s, a } = await seed(); task(a); await s.writeState(); remote.branchUnavailable = true;
    const b = await restart('PR:targeted-read-failed');
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(b.state.agents.find((x: Any) => x.id === a.id).status).toBe('stopped');
  });

  it('multiple durable tasks respect capacity and retain the held task', async () => {
    const { s, a } = await seed(); task(a);
    const second = s.hireAgent(repoId, { name: 'Grace' });
    const saved = s.state.agents.find((x: Any) => x.id === second.id);
    task(saved, 'issue', { issueNumber: 4, branch: 'swarm/issue-4-grace' });
    await s.writeState();
    const b = await restart('capacity:two-durable-writers');
    b.schedule(); b.schedule(); await settle();
    expect(calls.startSession).toHaveBeenCalledTimes(1); // one worker + CEO reservation = limit 2
    expect(b.state.agents.find((x: Any) => x.id === second.id)).toMatchObject({ status: 'stopped', issueNumber: 4 });
    gates(b);
  });

  it('fix preparation with no durable session waits for a human rather than another writer', async () => {
    const { s, a } = await seed(); task(a, 'fix', { sessionId: null });
    remote.pulls = [pull()]; record(s, { status: 'fixing', devAgentId: a.id });
    await s.writeState(); const b = await restart('fix:no-durable-session');
    b.schedule(); b.schedule(); await settle();
    expect(b.state.qa[0]).toMatchObject({ status: 'needs-human', summary: 'saved evidence' });
    expect(b.state.agents.find((x: Any) => x.id === a.id)).toMatchObject({ status: 'stopped', task: 'fix' });
    expect(calls.startSession).not.toHaveBeenCalled();
  });

  it('merge succeeded before acknowledgement: restart reads remote and never merges twice', async () => {
    const { s, repo } = await seed(); remote.pulls = [pull()];
    const q = record(s, { status: 'passed', passedSha: 'aaa' });
    await s.writeState();
    await s.advanceMerge(repo, q, remote.pulls[0]); // mutation succeeds then throws acknowledgement loss
    expect(remote.merges).toBe(1);
    const b = await restart('merge:external-outcome-before-ack');
    b.state.repos[0].autoMerge = true; await b.syncRepo(repoId); await settle();
    expect(remote.merges).toBe(1);
    expect(b.state.qa).toHaveLength(0);
    expect(remote.events.indexOf('read-details')).toBeLessThan(remote.events.indexOf('merge'));
    gates(b);
  });

  it.each(['bbb', 'aaa'])('durable QA signoff reconciles fresh head %s before merge', async (headSha) => {
    const { s } = await seed(); record(s, { status: 'passed', passedSha: 'aaa' });
    await s.writeState(); remote.pulls = [pull({ headSha })];
    const b = await restart(`merge:after-checkpoint:${headSha}`);
    b.state.repos[0].autoMerge = true; await b.syncRepo(repoId); await settle();
    if (headSha === 'bbb') {
      expect(b.state.qa[0]).toMatchObject({ status: 'queued', passedSha: null });
      expect(remote.merges).toBe(0);
    } else expect(remote.merges).toBe(1);
  });

  it('failed atomic rename leaves the previous checkpoint readable', async () => {
    const { s, a } = await seed(); task(a); s.save();
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('interruption before rename'));
    await expect(s.writeState()).rejects.toThrow('interruption');
    expect(JSON.parse(await fs.readFile(`${STATE_FILE}.tmp`, 'utf8')).agents[0].issueNumber).toBe(3);
    const b = await restart('checkpoint:temp-written-before-rename');
    expect(b.state.agents.find((x: Any) => x.id === a.id).task).toBeNull();
    expect(calls.startSession).not.toHaveBeenCalled();
  });

  it('pause, capacity, auto-assignment, auto-merge and pending owner approval survive restart', async () => {
    const { s, a } = await seed(); task(a); s.state.settings.schedulerPaused = true;
    record(s, { status: 'needs-human' });
    remote.pulls = [pull()];
    await s.writeState(); const b = await restart('gates:after-checkpoint');
    b.schedule(); await settle();
    gates(b);
    expect(b.snapshot().settings.schedulerPaused).toBe(true);
    expect(b.snapshot().repos[0]).toMatchObject({ autoAssign: false, autoMerge: false });
    expect(b.snapshot().qa[0].status).toBe('needs-human');
    if (process.env.RECOVERY_EXPORT_DEMO === '1') {
      await b.writeState();
      const demoHome = path.resolve('node_modules/recovery-demo');
      await fs.mkdir(demoHome, { recursive: true });
      await fs.copyFile(STATE_FILE, path.join(demoHome, 'demo-state.json'));
      await fs.writeFile(path.join(demoHome, 'snapshot.json'), JSON.stringify({ ...b.snapshot(), demo: true }));
    }
    expect(calls.startSession).not.toHaveBeenCalled();
    expect(calls.mergePull).not.toHaveBeenCalled();
  });
});
