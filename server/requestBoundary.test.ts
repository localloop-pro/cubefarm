import { describe, expect, it } from 'vitest';
import { officeRequest, type OfficeRequest } from './requestBoundary.ts';

const boundary = { port: 4317 };
const request = (patch: Partial<OfficeRequest> = {}): OfficeRequest => ({
  method: 'GET', headers: { host: 'localhost:4317' }, url: '/api/state', isUpgrade: false, ...patch,
});
const check = (headers: OfficeRequest['headers'], patch: Partial<OfficeRequest> = {}) => officeRequest(request({ headers, ...patch }), boundary);
const refused = (decision: ReturnType<typeof officeRequest>) => expect(decision).toMatchObject({ allow: false, status: 403, reason: expect.any(String) });

describe('officeRequest', () => {
  for (const host of ['localhost:4317', '127.0.0.1:4317', '[::1]:4317']) {
    it(`accepts exact loopback Host ${host}`, () => expect(check({ host })).toEqual({ allow: true }));
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      it(`accepts ${method} with exact loopback Origin ${host}`, () => {
        expect(check({ host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' }, { method })).toEqual({ allow: true });
      });
    }
  }

  const badAuthorities = [
    '0.0.0.0:4317', '127.1:4317', '2130706433:4317', '0177.0.0.1:4317', '0x7f000001:4317',
    'localhost.:4317', 'localhost.evil:4317', 'evil.localhost:4317', '127.0.0.1.evil:4317',
    'user@localhost:4317', 'localhost:4317@evil', 'localhost:4317/path', 'localhost:4317?x=1',
    'localhost:4317#fragment', 'localhost:4318', 'localhost:5317', 'localhost', 'localhost:',
    'localhost:04317', 'localhost:+4317', 'localhost:4.317e3', 'localhost:65536', 'localhost:0',
    '::1:4317', '[::ffff:127.0.0.1]:4317', '[::1%lo0]:4317', '[::1]:4318',
    'LOCALHOST:4317', ' localhost:4317', 'localhost:4317 ', 'localhost:4317\r\nX:1',
    'localhost:4317,evil:4317', 'http://localhost:4317', '',
  ];
  for (const host of badAuthorities) {
    it(`rejects Host ${JSON.stringify(host)}`, () => refused(check({ host })));
    it(`rejects Origin authority ${JSON.stringify(host)}`, () => refused(check({ host: 'localhost:4317', origin: `http://${host}` })));
  }
  for (const origin of ['null', 'https://localhost:4317', 'ftp://localhost:4317', 'HTTP://localhost:4317', 'http://localhost:4317/', 'http://evil.test:4317', 'http://localhost:4317 http://evil.test', '']) {
    it(`rejects Origin ${JSON.stringify(origin)}`, () => refused(check({ host: 'localhost:4317', origin })));
  }
  it('rejects missing Host', () => refused(check({})));
  it('accepts mixed-case field names', () => expect(check({ Host: 'localhost:4317', Origin: 'http://localhost:4317' })).toEqual({ allow: true }));
  for (const name of ['host', 'origin', 'sec-fetch-site']) {
    const value = name === 'host' ? 'localhost:4317' : name === 'origin' ? 'http://localhost:4317' : 'same-origin';
    it(`rejects array-valued ${name}`, () => refused(check({ host: 'localhost:4317', [name]: [value] })));
    it(`rejects case-variant duplicate ${name}`, () => refused(check({ host: 'localhost:4317', [name]: value, [name.toUpperCase()]: value })));
    it(`rejects duplicates in raw ${name}`, () => {
      const headers = { host: 'localhost:4317', [name]: value };
      const rawHeaders = Object.entries(headers).flat().concat([name.toUpperCase(), value]);
      refused(check(headers, { rawHeaders }));
    });
  }
  it('accepts matching raw headers', () => expect(check({ host: 'localhost:4317' }, { rawHeaders: ['Host', 'localhost:4317', 'Accept', '*/*'] })).toEqual({ allow: true }));
  for (const rawHeaders of [['Host'], ['Bad Name', 'x'], ['Host', 'evil:4317'], [], ['Host', 'localhost:4317', 'Origin', 'http://localhost:4317']]) {
    it(`rejects inconsistent/malformed raw headers ${JSON.stringify(rawHeaders)}`, () => refused(check({ host: 'localhost:4317' }, { rawHeaders })));
  }

  for (const method of ['GET', 'HEAD']) {
    for (const site of [undefined, 'none', 'same-origin']) {
      it(`accepts originless ${method} with Fetch Metadata ${site}`, () => expect(check({ host: 'localhost:4317', 'sec-fetch-site': site }, { method })).toEqual({ allow: true }));
    }
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']) {
    it(`rejects originless ${method}`, () => refused(check({ host: 'localhost:4317' }, { method })));
  }
  for (const origin of [undefined, 'http://localhost:4317']) {
    it(`rejects cross-site metadata despite Origin ${origin}`, () => refused(check({ host: 'localhost:4317', origin, 'sec-fetch-site': 'cross-site' })));
  }
  it('requires Origin with same-site metadata', () => refused(check({ host: 'localhost:4317', 'sec-fetch-site': 'same-site' })));
  it('accepts same-site only with an allowed Origin', () => expect(check({ host: 'localhost:4317', origin: 'http://127.0.0.1:4317', 'sec-fetch-site': 'same-site' })).toEqual({ allow: true }));
  for (const site of ['', 'Same-Origin', 'same-origin, none', 'same-origin\n', 'unknown']) {
    it(`rejects malformed metadata ${JSON.stringify(site)}`, () => refused(check({ host: 'localhost:4317', origin: 'http://localhost:4317', 'sec-fetch-site': site })));
  }

  it('allows explicit development client Host and Origin', () => {
    expect(officeRequest(request({ headers: { host: 'localhost:5317', origin: 'http://localhost:5317' }, method: 'POST' }), { port: 4317, dev: true, clientPort: 5317 })).toEqual({ allow: true });
  });
  it('allows the client Origin behind a backend proxy', () => {
    expect(officeRequest(request({ headers: { host: '127.0.0.1:4317', origin: 'http://localhost:5317' } }), { port: 4317, dev: true, clientPort: 5317 })).toEqual({ allow: true });
  });
  it('does not enable the client port in production', () => refused(officeRequest(request({ headers: { host: 'localhost:4317', origin: 'http://localhost:5317' } }), { port: 4317, clientPort: 5317 })));
  for (const port of [0, -1, 65536, 4317.1, NaN, Infinity]) {
    it(`rejects invalid server port ${port}`, () => refused(officeRequest(request(), { port })));
    it(`rejects invalid dev client port ${port}`, () => refused(officeRequest(request(), { port: 4317, dev: true, clientPort: port })));
  }
  it('requires explicit dev client port', () => refused(officeRequest(request(), { port: 4317, dev: true })));
  it('uses the actual configured port', () => expect(officeRequest(request({ headers: { host: 'localhost:12345' } }), { port: 12345 })).toEqual({ allow: true }));

  for (const url of ['/ws', '/ws/term']) {
    it(`accepts browser upgrade ${url} with trusted Origin`, () => expect(check({ host: 'localhost:4317', origin: 'http://localhost:4317' }, { isUpgrade: true, url })).toEqual({ allow: true }));
    it(`rejects originless upgrade ${url}`, () => refused(check({ host: 'localhost:4317' }, { isUpgrade: true, url })));
  }
  it('rejects non-GET upgrades', () => refused(check({ host: 'localhost:4317', origin: 'http://localhost:4317' }, { isUpgrade: true, method: 'POST' })));
  for (const url of ['', 'http://localhost:4317/api/state', '//evil/api/state', '/\\evil', '/api/state#x', '/api/\nstate', '/api state']) {
    it(`rejects malformed request target ${JSON.stringify(url)}`, () => refused(check({ host: 'localhost:4317' }, { url })));
  }
  it('accepts paths and queries without interpreting encoded contents', () => expect(check({ host: 'localhost:4317' }, { url: '/api/a%20b?next=https%3A%2F%2Fexample.com' })).toEqual({ allow: true }));
  for (const method of ['', 'get', 'POST\r\n', 'GET POST']) {
    it(`rejects malformed method ${JSON.stringify(method)}`, () => refused(check({ host: 'localhost:4317' }, { method })));
  }
  it('does not provide originless unsafe token exceptions', () => {
    for (const url of ['/api/hooks/token', '/api/mcp/token']) refused(check({ host: 'localhost:4317' }, { method: 'POST', url }));
  });
});
