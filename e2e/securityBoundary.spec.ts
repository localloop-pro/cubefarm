import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

test('native hooks and the local UI retain access, while unrelated origins and hosts are refused', async ({ request, baseURL }) => {
  expect((await request.get('/api/state')).status()).toBe(200);
  expect((await request.get('/api/state', { headers: { Origin: baseURL! } })).status()).toBe(200);
  for (const headers of [
    { Origin: 'https://example.invalid' }, { Origin: 'null' }, { Host: 'rebind.example.invalid' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ] as Record<string, string>[]) {
    expect((await request.get('/api/state', { headers })).status()).toBe(403);
    expect((await request.patch('/api/settings', { headers, data: { sessionLimit: 99 } })).status()).toBe(403);
  }
  const state = await (await request.get('/api/state')).json();
  expect(state.settings.sessionLimit).not.toBe(99);
});

test('browser websocket origins protect both office state and terminal keystrokes', async ({ baseURL }) => {
  for (const path of ['/ws', '/ws/term?agent=ceo']) {
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(baseURL!.replace('http:', 'ws:') + path, { origin: 'https://example.invalid', handshakeTimeout: 5000 });
      ws.on('unexpected-response', (_req, res) => { resolve(res.statusCode!); res.resume(); ws.terminate(); });
      ws.on('open', () => { ws.close(); reject(new Error('Unrelated website obtained websocket access')); });
      ws.on('error', () => {}); // rejection closes the socket after its HTTP status was recorded
    });
    expect(status).toBe(403);
  }
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(baseURL!.replace('http:', 'ws:') + '/ws', { origin: baseURL, handshakeTimeout: 5000 });
    ws.on('message', () => { ws.close(); resolve(); });
    ws.on('error', reject);
  });
});
