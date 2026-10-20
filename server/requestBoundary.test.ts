import { describe, expect, it } from 'vitest';
import { trustedOfficeRequest } from './requestBoundary.ts';

describe('office request boundary', () => {
  it('accepts the office browser and native CLI callbacks', () => {
    expect(trustedOfficeRequest({ host: '127.0.0.1:4399' }, 4399)).toBe(true);
    expect(trustedOfficeRequest({ host: 'localhost:4399', origin: 'http://localhost:4399' }, 4399)).toBe(true);
    expect(trustedOfficeRequest({ host: '[::1]:4399', origin: 'http://[::1]:4399' }, 4399)).toBe(true);
    expect(trustedOfficeRequest({ host: 'localhost:4399', origin: 'http://localhost:5399' }, 4399, 5399)).toBe(true);
  });

  it('refuses rebinding, unrelated sites, null origins and unrelated local ports', () => {
    for (const host of ['rebind.example:4399', 'localhost.evil:4399', 'localhost:4400', 'user@localhost:4399', 'localhost:4399/path', 'localhost:4399?x=1']) {
      expect(trustedOfficeRequest({ host }, 4399), host).toBe(false);
    }
    for (const origin of ['https://example.com', 'null', 'http://localhost:4400', 'https://localhost:4399', 'http://localhost:4399/path', 'http://localhost:4399?x=1', 'http://user@localhost:4399']) {
      expect(trustedOfficeRequest({ host: 'localhost:4399', origin }, 4399), origin).toBe(false);
    }
    expect(trustedOfficeRequest({}, 4399)).toBe(false);
    expect(trustedOfficeRequest({ host: 'localhost:4399', 'sec-fetch-site': 'cross-site' }, 4399)).toBe(false);
  });
});
