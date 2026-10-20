import { describe, expect, it } from 'vitest';
import { checkRequest, type BoundaryHeaders, type BoundaryRequest } from './requestBoundary.ts';

const PORT = 4400;
const CLIENT = 5400;
const prod = { port: PORT };
const dev = { port: PORT, clientPort: CLIENT };

function req(headers: BoundaryHeaders, extra: Partial<BoundaryRequest> = {}): BoundaryRequest {
  return { method: 'GET', url: '/api/state', isUpgrade: false, headers, ...extra };
}
const allowed = (r: BoundaryRequest, opts = prod) => checkRequest(r, opts).allow;
const reason = (r: BoundaryRequest, opts = prod) => {
  const d = checkRequest(r, opts);
  return d.allow ? 'allowed' : d.reason;
};

describe('Host', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]'])('accepts %s with the bound port', (h) => {
    expect(allowed(req({ host: `${h}:${PORT}` }))).toBe(true);
  });

  it.each([
    '0.0.0.0:4400', '127.1:4400', '2130706433:4400', '0x7f000001:4400', '0177.0.0.1:4400', '127.0.0.01:4400',
    'localhost.:4400', '127.0.0.1.:4400', 'localhost.evil.com:4400', 'evil.localhost:4400', 'user@localhost:4400',
    'localhost:4400/path', 'localhost:4400?q', 'localhost:4400#f', 'localhost:4401', 'localhost', '[::1]',
    '::1:4400', '[0:0:0:0:0:0:0:1]:4400', 'LOCALHOST:4400', 'localhost:04400', 'localhost:4400:4400', 'localhost:',
    'evil.com', '', `localhost:${CLIENT}`,
  ])('rejects %j', (h) => {
    expect(allowed(req({ host: h }))).toBe(false);
  });

  it('rejects a missing Host', () => expect(reason(req({}))).toBe('missing host header'));

  it('rejects duplicate Hosts (array, folded and raw)', () => {
    expect(reason(req({ host: ['localhost:4400', 'localhost:4400'] }))).toBe('duplicate host header');
    expect(reason(req({ host: 'localhost:4400,localhost:4400' }))).toBe('malformed host header');
    const raw = ['Host', 'localhost:4400', 'host', 'evil.com'];
    expect(reason(req({ host: 'localhost:4400' }, { rawHeaders: raw }))).toBe('duplicate host header');
  });

  it('rejects malformed Hosts', () => {
    expect(reason(req({ host: 'localhost :4400' }))).toBe('malformed host header');
    expect(reason(req({ host: 'localhost:4400\t' }))).toBe('malformed host header');
  });

  it('accepts the exact client port only in dev', () => {
    expect(allowed(req({ host: `localhost:${CLIENT}` }), dev)).toBe(true);
    expect(allowed(req({ host: `localhost:${PORT}` }), dev)).toBe(true);
    expect(allowed(req({ host: `localhost:${CLIENT + 1}` }), dev)).toBe(false);
  });
});

describe('request target', () => {
  it.each(['http://evil.com/', '//evil.com/', 'evil.com:80', '*'])('rejects %j', (url) => {
    expect(allowed(req({ host: 'localhost:4400' }, { url }))).toBe(false);
  });
});

describe('Fetch Metadata and Origin', () => {
  const host = `localhost:${PORT}`;
  const origin = `http://localhost:${PORT}`;

  it('always rejects Sec-Fetch-Site: cross-site, even with an allowed Origin', () => {
    expect(reason(req({ host, 'sec-fetch-site': 'cross-site' }))).toBe('cross-site request');
    expect(allowed(req({ host, origin, 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(allowed(req({ host, origin, 'sec-fetch-site': 'cross-site' }, { method: 'POST' }))).toBe(false);
  });

  it('rejects malformed and duplicate Sec-Fetch-Site', () => {
    expect(allowed(req({ host, 'sec-fetch-site': 'bogus' }))).toBe(false);
    expect(allowed(req({ host, 'sec-fetch-site': ['none', 'none'] }))).toBe(false);
    expect(allowed(req({ host, 'sec-fetch-site': 'none, cross-site' }))).toBe(false);
  });

  it.each(['GET', 'HEAD', 'get'])('lets safe %s omit Origin with Fetch Metadata absent, none or same-origin', (method) => {
    expect(allowed(req({ host }, { method }))).toBe(true);
    expect(allowed(req({ host, 'sec-fetch-site': 'none' }, { method }))).toBe(true);
    expect(allowed(req({ host, 'sec-fetch-site': 'same-origin' }, { method }))).toBe(true);
    expect(allowed(req({ host, 'sec-fetch-site': 'same-site' }, { method }))).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('requires an allowed Origin for %s', (method) => {
    expect(reason(req({ host }, { method }))).toBe(`${method} without origin`);
    expect(allowed(req({ host, 'sec-fetch-site': 'same-origin' }, { method }))).toBe(false);
    expect(allowed(req({ host, origin }, { method }))).toBe(true);
    expect(allowed(req({ host, origin, 'sec-fetch-site': 'same-origin' }, { method }))).toBe(true);
  });

  it('accepts every exact loopback Origin on an allowed port', () => {
    for (const o of ['http://127.0.0.1:4400', 'http://localhost:4400', 'http://[::1]:4400']) {
      expect(allowed(req({ host, origin: o }, { method: 'POST' }))).toBe(true);
    }
    expect(allowed(req({ host, origin: `http://localhost:${CLIENT}` }, { method: 'POST' }), dev)).toBe(true);
  });

  it.each([
    'null', 'http://evil.com', 'https://localhost:4400', 'http://localhost:4400/', 'http://localhost:4401',
    'http://localhost', 'http://0.0.0.0:4400', 'http://127.1:4400', 'http://localhost.:4400',
    'http://user@localhost:4400', 'http://localhost:4400.evil.com', 'http://localhost:4400?x', 'localhost:4400',
    `http://localhost:${CLIENT}`, '',
  ])('rejects Origin %j', (o) => {
    expect(allowed(req({ host, origin: o }, { method: 'POST' }))).toBe(false);
    expect(allowed(req({ host, origin: o }))).toBe(false);
  });

  it('rejects duplicate and malformed Origins', () => {
    expect(reason(req({ host, origin: [origin, origin] }, { method: 'POST' }))).toBe('duplicate origin header');
    expect(reason(req({ host, origin: `${origin}, http://evil.com` }, { method: 'POST' }))).toBe('malformed origin header');
    const raw = ['Host', host, 'Origin', origin, 'Origin', 'http://evil.com'];
    expect(reason(req({ host, origin }, { method: 'POST', rawHeaders: raw }))).toBe('duplicate origin header');
  });
});

describe('websocket upgrades', () => {
  const host = `localhost:${PORT}`;
  const ws = (headers: BoundaryHeaders) => req(headers, { url: '/ws', isUpgrade: true });

  it('needs an allowed Origin', () => {
    expect(allowed(ws({ host, origin: `http://localhost:${PORT}` }))).toBe(true);
    expect(reason(ws({ host }))).toBe('websocket upgrade without origin');
    expect(allowed(ws({ host, origin: 'http://evil.com' }))).toBe(false);
    expect(allowed(ws({ host: 'evil.com', origin: `http://localhost:${PORT}` }))).toBe(false);
  });

  it('accepts the dev client origin only in dev', () => {
    const r = ws({ host, origin: `http://localhost:${CLIENT}` });
    expect(allowed(r, dev)).toBe(true);
    expect(allowed(r, prod)).toBe(false);
  });
});

it('answers 403 with a reason', () => {
  expect(checkRequest(req({ host: 'evil.com' }), prod)).toEqual({ allow: false, status: 403, reason: 'host not allowed' });
});
