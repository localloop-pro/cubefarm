import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real index.ts middleware/routes and real JSON parsers over an ephemeral HTTP socket.
// Only the swarm/session backends are stand-ins; no live office or CLI is initialized.
const calls = vi.hoisted(() => ({ hook: vi.fn(), mcp: vi.fn(), snapshot: vi.fn(), setup: vi.fn() }));
vi.mock('./swarm.ts', async () => ({
  HttpError: (await import('./httpError.ts')).HttpError,
  Swarm: class {
    init = async () => undefined;
    snapshot = () => calls.snapshot();
    setup = (body: unknown) => calls.setup(body);
  },
}));
vi.mock('./cliRunner.ts', async (original) => ({
  ...await original<typeof import('./cliRunner.ts')>(),
  setOfficeUrl: vi.fn(),
  hasCliRoute: (token: string, kind: string) => token === 'office-token' || (kind === 'hooks' && token === 'hook-token'),
  handleHook: (_token: string, body: unknown) => { calls.hook(body); return { hook: true }; },
  handleMcp: async (_token: string, req: { body: unknown }, res: { json: (body: unknown) => void }) => { calls.mcp(req.body); res.json({ mcp: true }); },
}));

let server: http.Server;
let port: number;
const originalArgv = process.argv;
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'message'] as const;
const originalListeners = signals.map((signal) => process.listeners(signal));

beforeAll(async () => {
  // Vitest already sets SWARM_HOME to temp and SWARM_PORT=0. Explicit demo mode is mandatory.
  vi.stubEnv('SWARM_DEMO', '1');
  vi.stubEnv('SWARM_LAUNCHER', '');
  vi.stubEnv('SWARM_CLIENT_PORT', '55317');
  process.argv = [process.execPath, path.resolve('server/index.ts'), '--demo'];
  ({ server } = await import('./index.ts'));
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  port = (server.address() as AddressInfo).port;
  process.argv = originalArgv;
});
afterAll(async () => {
  process.argv = originalArgv;
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  signals.forEach((signal, i) => {
    for (const listener of process.listeners(signal)) if (!originalListeners[i].includes(listener)) process.removeListener(signal, listener);
  });
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  calls.snapshot.mockReturnValue({ safe: true });
  calls.setup.mockReturnValue({ ok: true });
});

function send(url: string, options: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string; rawHeaders?: string[] } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const body = options.body ?? (options.method === 'GET' || options.method === 'HEAD' ? '' : '{}');
    const length = String(Buffer.byteLength(body));
    const headers = options.rawHeaders?.concat(['Content-Length', length]) ?? { Host: `localhost:${port}`, 'Content-Type': 'application/json', 'Content-Length': length, ...options.headers };
    let responded = false;
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method: options.method ?? 'POST', headers, agent: false }, (res) => {
      responded = true;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (data) => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', (err) => { if (!responded) reject(err); });
    req.end(body);
  });
}

describe('HTTP boundary before JSON parsing', () => {
  it('serves trusted reads and writes through the real routes', async () => {
    expect((await send('/api/state', { method: 'GET' })).status).toBe(200);
    expect(calls.snapshot).toHaveBeenCalledOnce();
    expect((await send('/api/setup', { headers: { Origin: `http://localhost:${port}` }, body: '{"managerName":"Ada"}' })).status).toBe(200);
    expect(calls.setup).toHaveBeenCalledWith(expect.objectContaining({ managerName: 'Ada' }));
  });
  it('allows the explicitly configured Vite client origin/Host', async () => {
    expect((await send('/api/setup', { headers: { Host: 'localhost:55317', Origin: 'http://localhost:55317' } })).status).toBe(200);
  });
  for (const headers of [
    { Host: 'evil.test:1234' }, { Origin: 'http://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' },
    { Origin: 'null' }, { Origin: 'http://localhost:55318' },
  ]) {
    it(`refuses hostile reads and writes before parsing ${JSON.stringify(headers)}`, async () => {
      for (const method of ['GET', 'POST']) expect((await send('/api/state', { method, headers, body: '{' })).status).toBe(403);
      expect(calls.snapshot).not.toHaveBeenCalled();
      expect(calls.setup).not.toHaveBeenCalled();
    });
  }
  it('rejects originless manager writes before parsing', async () => {
    expect((await send('/api/setup', { body: '{' })).status).toBe(403);
    expect(calls.setup).not.toHaveBeenCalled();
  });
  for (const url of [
    '/api/hooks/unknown', '/api/mcp/unknown', '/api/mcp/hook-token', '/api/hooks', '/api/mcp',
    '/api/hooks/hook-token/x', '/api/hooksx/hook-token', '/api/mcpx/office-token',
    '/API/hooks/hook-token', '/api/hooks/hook-token/', '/api/hooks/hook-token?x=1',
    '/api/hooks/%68ook-token', '/api/hooks/hook%2ftoken', '/api/%68ooks/hook-token',
    '/api//hooks/hook-token', '/api/hooks/%ZZ',
  ]) {
    it(`refuses unknown/malformed callback before parsing ${url}`, async () => {
      expect((await send(url, { headers: { Origin: `http://localhost:${port}` }, body: '{' })).status).toBe(403);
      expect(calls.hook).not.toHaveBeenCalled();
      expect(calls.mcp).not.toHaveBeenCalled();
    });
  }
  for (const [url, handler] of [['/api/hooks/hook-token', calls.hook], ['/api/mcp/office-token', calls.mcp]] as const) {
    it(`allows verified originless callback ${url}`, async () => {
      expect((await send(url, { body: '{"event":"ok"}' })).status).toBe(200);
      expect(handler).toHaveBeenCalledWith({ event: 'ok' });
    });
    it(`parses only after authorization ${url}`, async () => {
      expect((await send(url, { body: '{' })).status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    });
    for (const headers of [{ Host: 'evil.test:4317' }, { Origin: 'http://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      it(`does not let valid tokens bypass browser checks ${url} ${JSON.stringify(headers)}`, async () => {
        expect((await send(url, { headers, body: '{' })).status).toBe(403);
        expect(handler).not.toHaveBeenCalled();
      });
    }
    it(`rejects non-POST token methods ${url}`, async () => {
      for (const method of ['GET', 'PUT', 'DELETE']) expect((await send(url, { method, headers: { Origin: `http://localhost:${port}` }, body: '{' })).status).toBe(405);
      expect(handler).not.toHaveBeenCalled();
    });
    for (const method of ['GET', 'PUT', 'DELETE']) {
      it(`checks hostile headers before method refusal ${method} ${url}`, async () => {
        for (const headers of [{ Host: 'evil.test:4317' }, { Origin: 'http://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
          expect((await send(url, { method, headers, body: '{' })).status).toBe(403);
        }
        expect(handler).not.toHaveBeenCalled();
      });
    }
    it(`does not exempt originless unsafe non-POST methods ${url}`, async () => {
      for (const method of ['PUT', 'DELETE']) expect((await send(url, { method, body: '{' })).status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  }
  it('preserves parser limits and rejects unauthorized oversized bodies first', async () => {
    const body = JSON.stringify({ text: 'x'.repeat(1100 * 1024) });
    expect((await send('/api/setup', { headers: { Origin: `http://localhost:${port}` }, body })).status).toBe(413);
    // Declare a large body but send none: authorization must reply without waiting for or parsing it.
    expect((await send('/api/hooks/unknown', { headers: { 'Content-Length': String(Buffer.byteLength(body)) }, body: '' })).status).toBe(403);
    expect((await send('/api/hooks/hook-token', { body })).status).toBe(200);
  });
  it('rejects duplicate Host fields that Node would otherwise collapse', async () => {
    const rawHeaders = ['Host', `localhost:${port}`, 'Host', `localhost:${port}`, 'Content-Type', 'application/json'];
    expect((await send('/api/state', { method: 'GET', rawHeaders })).status).toBe(403);
  });
});

describe('WebSocket boundary', () => {
  const upgrade = (origin: string) => new Promise<number>((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/ws', agent: false,
      headers: { Host: `localhost:${port}`, Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('upgrade', (_res, socket) => { socket.destroy(); resolve(101); });
    req.on('error', reject);
    req.end();
  });
  it('rejects a cross-origin upgrade', async () => {
    expect(await upgrade('http://evil.test')).toBe(403);
  });
});
