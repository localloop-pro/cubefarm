import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express, { type Response } from 'express';
import crypto from 'node:crypto';
import { createRequestBoundary } from './requestBoundary.ts';

// Mock session token for testing
const TEST_SESSION_TOKEN = crypto.randomBytes(32).toString('hex');
const TEST_PORT = 9999;
const { validateOrigin, requireSessionToken, validateWebSocketUpgrade } = createRequestBoundary(TEST_PORT, TEST_SESSION_TOKEN);

describe('WebSocket Security', () => {
  it('accepts WebSocket upgrade with missing Origin header', () => {
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
