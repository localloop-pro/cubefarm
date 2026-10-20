import http from 'node:http';
import { expect, test } from '@playwright/test';

// The office's browser boundary (server/requestBoundary.ts) end to end: the real page and its websocket get in,
// a page on another origin, a hostile Host and a cross-site websocket get 403. Raw node:http requests set the
// headers a browser won't let a page forge (Host); the browser tests show what a real hostile page gets.

const PORT = Number(process.env.E2E_PORT || 4399);
const CLIENT_PORT = Number(process.env.SWARM_CLIENT_PORT || 5317);
const OFFICE = `http://127.0.0.1:${PORT}`;
// Another origin on this machine: a throwaway page on the next port (loopback, so Chrome's local-network checks
// let it try), whose requests to the office must be refused by the office itself.
const EVIL = `http://127.0.0.1:${PORT + 1}`;
let evilServer: http.Server;
test.beforeAll(async () => {
  evilServer = http.createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>evil</title>'));
  await new Promise<void>((resolve) => evilServer.listen(PORT + 1, '127.0.0.1', resolve));
});
test.afterAll(() => new Promise<void>((resolve) => evilServer.close(() => resolve())));

/** One raw request to the office; resolves with the status (an upgrade's 101 or refusal included). */
function raw(opts: { method?: string; path?: string; headers?: Record<string, string>; upgrade?: boolean }): Promise<number> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${PORT}`, ...opts.headers };
    if (opts.upgrade) Object.assign(headers, { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' });
    const req = http.request({ host: '127.0.0.1', port: PORT, method: opts.method ?? 'GET', path: opts.path ?? '/api/state', headers, setHost: false });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

test('the office page loads and its websocket connects (production path)', async ({ page }) => {
  const ws = page.waitForEvent('websocket', (w) => new URL(w.url()).pathname === '/ws');
  await page.goto('/');
  const socket = await ws;
  await expect.poll(() => socket.isClosed()).toBe(false);
  await socket.waitForEvent('framereceived');
  expect(await raw({ upgrade: true, path: '/ws', headers: { origin: OFFICE } })).toBe(101);
  expect(await raw({ upgrade: true, path: '/ws/term?agent=x', headers: { origin: `http://localhost:${PORT}` } })).toBe(101);
});

test('the Vite proxy origin (SWARM_CLIENT_PORT) is accepted', async () => {
  // Headers only, as Vite's proxy forwards them: nothing connects to the client port itself.
  const origin = `http://localhost:${CLIENT_PORT}`;
  expect(await raw({ headers: { host: `localhost:${CLIENT_PORT}`, origin, 'sec-fetch-site': 'same-origin' } })).toBe(200);
  expect(await raw({ upgrade: true, path: '/ws', headers: { host: `localhost:${CLIENT_PORT}`, origin } })).toBe(101);
});

test('a page on another origin gets 403 on a read, a write and a websocket', async ({ page }) => {
  await page.goto(`${EVIL}/`);
  const statuses: Record<string, number> = {};
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin === OFFICE) statuses[`${res.request().method()} ${url.pathname}`] = res.status();
  });
  const wsErrors: string[] = [];
  page.on('console', (m) => void (/WebSocket/.test(m.text()) && wsErrors.push(m.text())));
  const opened = await page.evaluate(async (office) => {
    await fetch(`${office}/api/state`, { mode: 'no-cors' }).catch(() => null);
    await fetch(`${office}/api/state`, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: '{}' }).catch(() => null);
    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`${office.replace('http', 'ws')}/ws`);
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });
  }, OFFICE);
  expect(opened).toBe(false);
  await expect.poll(() => wsErrors.join('\n')).toContain('403');
  await expect.poll(() => statuses['GET /api/state']).toBe(403);
  await expect.poll(() => statuses['POST /api/state']).toBe(403);
  // The same requests as the browser sent them, read directly (a refused page can't see the status).
  const evil = { origin: EVIL, 'sec-fetch-site': 'same-site' };
  expect(await raw({ headers: evil })).toBe(403);
  expect(await raw({ method: 'POST', headers: { ...evil, 'content-type': 'text/plain' } })).toBe(403);
  expect(await raw({ upgrade: true, path: '/ws', headers: evil })).toBe(403);
  expect(await raw({ upgrade: true, path: '/ws/term?agent=x', headers: evil })).toBe(403);
  expect(await raw({ upgrade: true, path: '/ws' })).toBe(403); // a websocket without Origin
});

test('a hostile Host header is rejected (DNS rebinding)', async () => {
  for (const host of ['evil.example', `evil.example:${PORT}`, `127.0.0.1.evil.example:${PORT}`, `localhost:${PORT + 1}`]) {
    expect(await raw({ headers: { host } }), host).toBe(403);
    expect(await raw({ upgrade: true, path: '/ws', headers: { host, origin: `http://${host}` } }), host).toBe(403);
  }
});
