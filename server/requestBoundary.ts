import type { IncomingHttpHeaders } from 'node:http';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function localUrl(value: string, ports: number[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOOPBACK.has(url.hostname) && ports.includes(Number(url.port || 80)) &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Loopback binding alone does not prevent a website from opening the office's terminal websocket. */
export function trustedOfficeRequest(headers: IncomingHttpHeaders, port: number, clientPort?: number): boolean {
  if (!headers.host || !localUrl(`http://${headers.host}`, [port])) return false;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  // Native CLI hooks have no Origin; browsers must supply a local office origin when they supply one at all.
  if (headers.origin === undefined) return true;
  return typeof headers.origin === 'string' && localUrl(headers.origin, clientPort ? [port, clientPort] : [port]);
}
