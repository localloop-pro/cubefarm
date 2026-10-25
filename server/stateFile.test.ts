import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { STATE_FILE } from './config.ts';
import { quarantineDiagnostics, Swarm } from './swarm.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const agent = (p: Record<string, unknown> = {}) => ({
  id: 'a1', name: 'Ada', repoId: 'r1', role: 'dev', desk: 0, status: 'idle', task: null, issueNumber: null, issueTitle: null,
  branch: null, prNumber: null, prUrl: null, sessionId: null, sessionCli: null, cli: '', model: '', effort: '', ...p,
});
const qa = (p: Record<string, unknown> = {}) => ({ repoId: 'r1', prNumber: 7, status: 'queued', round: 1, devAgentId: null, qaAgentId: null, ...p });

async function load(state: Record<string, unknown>) {
  // Read from memory: other test files write the shared state file in parallel.
  const read = fs.readFile;
  vi.spyOn(fs, 'readFile').mockImplementation(((file: string, ...rest: unknown[]) =>
    file === STATE_FILE ? Promise.resolve(JSON.stringify(state)) : (read as Any)(file, ...rest)) as Any);
  const backend = new Proxy({}, {
    get: (_t, k) => (k === 'demo' ? false : k === 'reconnectClis' || k === 'user' || k === 'detectClis' ? async () => [] : k === 'office' ? { head: async () => null, takeLastUpdate: async () => null } : () => undefined),
  }) as unknown as Backend;
  const s = new Swarm(backend) as Any;
  for (const m of ['cloneRepo', 'syncRepo', 'ensureQaTester', 'ensureCeo', 'save', 'broadcast', 'schedule']) s[m] = async () => undefined;
  s.previews = { clearOrphans: async () => undefined, refreshDefault: async () => undefined };
  await s.init();
  return s;
}

describe('state file compatibility', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('migrates the legacy agent with no role to a developer', async () => {
    const s = await load({ agents: [agent({ role: undefined })] });
    expect(s.state.agents[0].role).toBe('dev');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Quarantined'));
  });

  it('loads every known role and status', async () => {
    const statuses = ['idle', 'done', 'error', 'stopped'];
    const s = await load({
      agents: [...statuses.map((status, i) => agent({ id: `d${i}`, status })), agent({ id: 'q', role: 'qa' }), agent({ id: 'c', role: 'ceo', repoId: '' })],
      qa: ['queued', 'testing', 'passed', 'failed', 'fixing', 'needs-human'].map((status, i) => qa({ prNumber: i, status })),
    });
    expect(s.state.agents.map((a: Any) => a.status)).toEqual([...statuses, 'idle', 'idle']);
    expect(quarantineDiagnostics(s.state)).toEqual([]);
  });

  it('quarantines an unknown role or status with a diagnostic and never schedules it', async () => {
    const s = await load({
      repos: [],
      agents: [agent({ id: 'x', name: 'Rex', role: 'architect' }), agent({ id: 'y', name: 'Yan', status: 'sleeping' })],
      qa: [qa({ status: 'archived' })],
    });
    const [x, y] = s.state.agents;
    expect(x.role).toBe('architect');
    expect(y.status).toBe('sleeping');
    expect(s.state.qa[0].status).toBe('archived');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rex an unknown role "architect"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Yan an unknown status "sleeping"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PR #7 has an unknown status "archived"'));
    expect(s.agentRt.get('x').log.at(-1).text).toContain('Quarantined');
    const repo = { id: 'r1' };
    expect(s.available(repo, 'dev').map((a: Any) => a.id)).toEqual([]);
    expect(s.available(repo, 'qa')).toEqual([]);
  });

  it('loads a well-formed current state unchanged', async () => {
    const a = agent({ title: 'Dev', specialty: '', brief: '', hiredBy: 'manager', look: s0look(), sessionCli: null });
    const s = await load({ agents: [a] });
    const { logTail: _t, ...loaded } = s.state.agents[0];
    expect(loaded).toEqual(a);
    expect(quarantineDiagnostics(s.state)).toEqual([]);
  });
});

function s0look() {
  return { skin: 0, hair: 0, shirt: 0 };
}
