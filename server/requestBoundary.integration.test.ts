// The request boundary end to end: a demo office on an ephemeral port, real HTTP requests against it.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let office: ChildProcess;
let port = 0;
let home = '';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = net.createServer().once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });

function send(method: string, url: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  port = await freePort();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cubefarm-boundary-'));
  office = spawn(process.execPath, ['--import', 'tsx', path.join('server', 'index.ts'), '--demo'], {
    env: { ...process.env, SWARM_HOME: home, SWARM_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('office did not start')), 60_000);
    office.stdout!.on('data', (c) => String(c).includes('DEMO MODE') && (clearTimeout(timer), resolve()));
    office.once('exit', (code) => reject(new Error(`office exited ${code}`)));
  });
}, 70_000);

afterAll(async () => {
  if (office && office.exitCode === null) {
    const exited = new Promise((r) => office.once('exit', r));
    office.kill();
    await exited;
  }
  fs.rmSync(home, { recursive: true, force: true, maxRetries: 5 });
});

describe('HTTP boundary', () => {
  it('serves same-origin requests', async () => {
    expect((await send('GET', '/api/snapshot')).status).not.toBe(403);
    expect((await send('GET', '/api/snapshot', { Origin: `http://localhost:${port}`, 'Sec-Fetch-Site': 'same-origin' })).status).not.toBe(403);
  });

  it('rejects a hostile Host, Origin or cross-site fetch', async () => {
    expect((await send('GET', '/api/snapshot', { Host: 'evil.example' })).status).toBe(403);
    expect((await send('GET', '/api/snapshot', { Host: `evil.example:${port}` })).status).toBe(403);
    expect((await send('GET', '/api/snapshot', { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await send('GET', '/api/snapshot', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await send('POST', '/api/floors', { 'Content-Type': 'application/json' }, '{}')).status).toBe(403);
  });

  it('refuses unknown tokens before reading the body', async () => {
    const junk = { 'Content-Type': 'application/json' };
    expect((await send('POST', '/api/hooks/0000-unknown', junk, '{not json')).status).toBe(403);
    expect((await send('POST', '/api/mcp/0000-unknown', junk, '{not json')).status).toBe(404);
  });

  it('runs look-alike callback paths through the policy', async () => {
    const junk = { 'Content-Type': 'application/json' };
    for (const url of ['/api/hooks/abc/x', '/api/hooksx/abc', '/api/mcp', '/api/mcp/', '/api/hooks/a%2Fb']) {
      expect((await send('POST', url, junk, '{not json')).status, url).toBe(403);
    }
  });

  it('rejects a cross-origin websocket upgrade', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: '/ws',
        headers: { Host: `localhost:${port}`, Origin: 'http://evil.example', Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
      });
      req.on('response', (res) => resolve(res.statusCode ?? 0));
      req.on('upgrade', () => resolve(101));
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
