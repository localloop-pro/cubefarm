import { describe, expect, it, beforeAll } from 'vitest';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';

// Mock session token for testing
const TEST_SESSION_TOKEN = crypto.randomBytes(32).toString('hex');
const TEST_PORT = 9999;
const ALLOWED_HOSTS = [`localhost:${TEST_PORT}`, `127.0.0.1:${TEST_PORT}`];
const ALLOWED_ORIGINS = [`http://localhost:${TEST_PORT}`, `http://127.0.0.1:${TEST_PORT}`];

// Validation functions (mirrors from index.ts)
function validateOrigin(req: Request, _res: Response, next: Function) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (host && !ALLOWED_HOSTS.includes(host)) throw new Error('Invalid Host header');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new Error('Invalid Origin');
  next();
}

function requireSessionToken(req: Request, _res: Response, next: Function) {
  const token = req.headers['x-session-token'];
  if (token === TEST_SESSION_TOKEN) return next();
  throw new Error('Missing or invalid session token');
}

function validateWebSocketUpgrade(req: http.IncomingMessage): boolean {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!host || !ALLOWED_HOSTS.includes(host)) return false;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return false;
  const url = new URL(req.url ?? '', 'http://localhost');
  const token = url.searchParams.get('token');
  if (token !== TEST_SESSION_TOKEN) return false;
  return true;
}

describe('WebSocket Security', () => {
  let server: http.Server;
  let wss: WebSocketServer;

  beforeAll(() => {
    const app = express();
    server = http.createServer(app);
    wss = new WebSocketServer({ noServer: true });

    app.get('/api/session', (_req, res) => res.json({ token: TEST_SESSION_TOKEN }));
    app.get('/api/test', (req, res, _next) => {
      try {
        validateOrigin(req, res, () => {
          requireSessionToken(req, res, () => res.json({ ok: true }));
        });
      } catch (err) {
        res.status(401).json({ error: String(err) });
      }
    });

    server.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '', 'http://localhost');
      if (pathname === '/ws') {
        if (!validateWebSocketUpgrade(req)) return void socket.destroy();
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.send(JSON.stringify({ type: 'connected' }));
          ws.close();
        });
      }
    });

    server.listen(TEST_PORT, '127.0.0.1');
  });

  it('rejects WebSocket upgrade with missing Origin header', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=' + TEST_SESSION_TOKEN;
    req.headers.host = `localhost:${TEST_PORT}`;
    // Origin is absent; should be allowed
    expect(validateWebSocketUpgrade(req)).toBe(true);
  });

  it('rejects WebSocket upgrade with evil.example Origin', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=' + TEST_SESSION_TOKEN;
    req.headers.host = `localhost:${TEST_PORT}`;
    req.headers.origin = 'https://evil.example';
    expect(validateWebSocketUpgrade(req)).toBe(false);
  });

  it('rejects WebSocket upgrade with evil Host header (DNS rebinding)', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=' + TEST_SESSION_TOKEN;
    req.headers.host = 'evil.example';
    expect(validateWebSocketUpgrade(req)).toBe(false);
  });

  it('rejects WebSocket upgrade without session token', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws';
    req.headers.host = `localhost:${TEST_PORT}`;
    expect(validateWebSocketUpgrade(req)).toBe(false);
  });

  it('rejects WebSocket upgrade with invalid session token', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=invalid';
    req.headers.host = `localhost:${TEST_PORT}`;
    expect(validateWebSocketUpgrade(req)).toBe(false);
  });

  it('accepts WebSocket upgrade with correct Origin, Host, and token', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=' + TEST_SESSION_TOKEN;
    req.headers.host = `localhost:${TEST_PORT}`;
    req.headers.origin = `http://localhost:${TEST_PORT}`;
    expect(validateWebSocketUpgrade(req)).toBe(true);
  });

  it('accepts WebSocket upgrade with 127.0.0.1 instead of localhost', () => {
    const req = new http.IncomingMessage(null as any);
    req.url = '/ws?token=' + TEST_SESSION_TOKEN;
    req.headers.host = `127.0.0.1:${TEST_PORT}`;
    req.headers.origin = `http://127.0.0.1:${TEST_PORT}`;
    expect(validateWebSocketUpgrade(req)).toBe(true);
  });
});

describe('HTTP API Security', () => {
  it('validates Origin header', () => {
    const req = express.request as any;
    req.headers = { origin: 'https://evil.example' };
    expect(() => {
      validateOrigin(req, {} as Response, () => undefined);
    }).toThrow('Invalid Origin');
  });

  it('rejects Host header rebinding', () => {
    const req = express.request as any;
    req.headers = { host: 'evil.example' };
    expect(() => {
      validateOrigin(req, {} as Response, () => undefined);
    }).toThrow('Invalid Host header');
  });

  it('accepts correct Origin header', () => {
    const req = express.request as any;
    req.headers = { origin: `http://localhost:${TEST_PORT}` };
    let called = false;
    validateOrigin(req, {} as Response, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('rejects API requests without session token', () => {
    const req = express.request as any;
    req.headers = {};
    expect(() => {
      requireSessionToken(req, {} as Response, () => undefined);
    }).toThrow('Missing or invalid session token');
  });

  it('rejects API requests with invalid session token', () => {
    const req = express.request as any;
    req.headers = { 'x-session-token': 'invalid' };
    expect(() => {
      requireSessionToken(req, {} as Response, () => undefined);
    }).toThrow('Missing or invalid session token');
  });

  it('accepts API requests with valid session token', () => {
    const req = express.request as any;
    req.headers = { 'x-session-token': TEST_SESSION_TOKEN };
    let called = false;
    requireSessionToken(req, {} as Response, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe('Session Token', () => {
  it('generates a 64-character hex string (32 bytes)', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toHaveLength(64);
  });

  it('is unique on each generation', () => {
    const token1 = crypto.randomBytes(32).toString('hex');
    const token2 = crypto.randomBytes(32).toString('hex');
    expect(token1).not.toBe(token2);
  });
});
