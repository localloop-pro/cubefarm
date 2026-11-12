import { expect, test } from '@playwright/test';

test('session bootstrap enforces the real HTTP boundary without requiring a token', async ({ request, baseURL }) => {
  const port = new URL(baseURL!).port;
  for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
    for (const origin of [undefined, `http://localhost:${port}`, `http://127.0.0.1:${port}`]) {
      const response = await request.get('/api/session', { headers: { host, ...(origin ? { origin } : {}) } });
      expect(response.status()).toBe(200);
      expect((await response.json()).token).toMatch(/^[0-9a-f]{64}$/);
    }
  }
  const rejectedHeaders: Record<string, string>[] = [
    { host: `evil.example:${port}` },
    { origin: 'https://evil.example' },
    { origin: `http://localhost:${Number(port) + 1}` },
  ];
  for (const headers of rejectedHeaders) {
    const response = await request.get('/api/session', { headers });
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toMatch(/"token"\s*:/);
  }
});
