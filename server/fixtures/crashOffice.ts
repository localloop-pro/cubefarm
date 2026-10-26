// Test-only subprocess. Every boundary is fake; it cannot launch an agent or contact GitHub.
import path from 'node:path';
import type { Backend } from '../backend.ts';
import { HOME_DIR } from '../config.ts';
import { Swarm } from '../swarm.ts';

const mode = process.argv[2];
let starts = 0;
const fake = {
  demo: false, terminals: false,
  reconnectClis: async () => [], hooksReady: () => {}, user: async () => 'fake', detectClis: async () => [],
  ensureClone: async () => {}, releaseDesk: async () => {},
  prForBranch: async () => null,
  listIssues: async () => [{ number: 3, title: 'Durable task', labels: [], body: '', url: '' }], listPulls: async () => [],
  mainDir: () => path.join(HOME_DIR, 'main'), deskDir: () => path.join(HOME_DIR, 'dirty-desk'),
  previews: { hasDefault: async () => false },
  office: { head: async () => null, takeLastUpdate: async () => null, isOwnFolder: () => false },
  startSession: () => { starts++; return { send: () => {}, stop: () => {} }; },
};
const backend = new Proxy(fake, { get: (obj, key) => {
  if (key in obj) return obj[key as keyof typeof obj];
  throw new Error(`Forbidden subprocess boundary: ${String(key)}`);
} }) as unknown as Backend;
// Access the checkpoint solely in this test entry point.
const s = new Swarm(backend) as unknown as {
  init(): Promise<void>; writeState(): Promise<void>; snapshot(): unknown;
  state: { agents: { role: string; status: string; task: string; issueNumber: number; branch: string; sessionId: string; sessionCli: string }[] };
};
// Capture startup timers so the pre-checkpoint boundary cannot race a slow parent.
const timers: NodeJS.Timeout[] = [];
const timeout = globalThis.setTimeout;
const interval = globalThis.setInterval;
globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
  const timer = timeout(...args); timers.push(timer); return timer;
}) as typeof setTimeout;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const timer = interval(...args); timers.push(timer); return timer;
}) as typeof setInterval;
await s.init();
for (const timer of timers) clearTimeout(timer);
if (mode !== 'load') {
  const a = s.state.agents.find((a) => a.role === 'dev')!;
  Object.assign(a, { status: 'working', task: 'issue', issueNumber: 3, branch: 'swarm/issue-3-ada', sessionId: 'saved-session', sessionCli: 'claude' });
  if (mode === 'checkpoint') await s.writeState();
}
process.on('message', () => {}); // remain alive at the boundary until the parent kills us
process.send?.({ snapshot: s.snapshot(), starts });
// Parent SIGKILLs us at the signalled boundary. No shutdown/final checkpoint.
