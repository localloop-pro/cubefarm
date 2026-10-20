// The request boundary policy: a pure allow/403 decision for every HTTP request and websocket upgrade, from its
// method, headers and url. It mitigates browser attacks (CSRF, cross-site websockets, DNS rebinding) by accepting only
// exact loopback Hosts and same-office Origins; it is not authentication against local processes. Fails closed.

/** Node-style headers: lower-case names; a repeated header may arrive as an array. */
export type BoundaryHeaders = Record<string, string | string[] | undefined>;

export interface BoundaryRequest {
  method: string;
  headers: BoundaryHeaders;
  url: string;
  isUpgrade: boolean;
  /** Node's `rawHeaders` (name, value, name, value…), when available: Node drops repeated Host/Origin, this catches them. */
  rawHeaders?: string[];
}

export interface BoundaryOptions {
  /** The port the office is bound to. */
  port: number;
  /** In dev, the Vite client's exact port (`SWARM_CLIENT_PORT`), also accepted. */
  clientPort?: number;
}

export type BoundaryDecision = { allow: true } | { allow: false; status: 403; reason: string };

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const SINGLE_HEADERS = ['host', 'origin', 'sec-fetch-site'];
const SAFE_METHODS = new Set(['GET', 'HEAD']);

const deny = (reason: string): BoundaryDecision => ({ allow: false, status: 403, reason });

function allowedPorts(opts: BoundaryOptions): number[] {
  const ports = [opts.port];
  if (opts.clientPort !== undefined && opts.clientPort !== opts.port) ports.push(opts.clientPort);
  return ports.filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
}

/** The exact `host:port` forms accepted in Host and (after `http://`) in Origin. */
export function allowedHosts(opts: BoundaryOptions): string[] {
  return allowedPorts(opts).flatMap((port) => LOOPBACK_HOSTS.map((h) => `${h}:${port}`));
}

/** One header's single value, or an error when it is repeated or malformed. */
function single(req: BoundaryRequest, name: string): { value?: string; error?: string } {
  if (req.rawHeaders) {
    let count = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i]?.toLowerCase() === name) count++;
    if (count > 1) return { error: `duplicate ${name} header` };
  }
  const v = req.headers[name];
  if (v === undefined) return {};
  if (Array.isArray(v) || typeof v !== 'string') return { error: `duplicate ${name} header` };
  // A comma means values were folded together; control chars or spaces mean a malformed value.
  if (v.includes(',') || /[\s\x00-\x1f\x7f]/.test(v)) return { error: `malformed ${name} header` };
  return { value: v };
}

/** Decides whether a request or websocket upgrade may reach the office's routes. */
export function checkRequest(req: BoundaryRequest, opts: BoundaryOptions): BoundaryDecision {
  const values: Record<string, string | undefined> = {};
  for (const name of SINGLE_HEADERS) {
    const r = single(req, name);
    if (r.error) return deny(r.error);
    values[name] = r.value;
  }
  const hosts = allowedHosts(opts);

  const host = values.host;
  if (!host) return deny('missing host header');
  if (!hosts.includes(host)) return deny('host not allowed');

  // Origin-form targets only: an absolute or authority-form url could name another host.
  if (!req.url.startsWith('/') || req.url.startsWith('//')) return deny('malformed request target');

  const site = values['sec-fetch-site'];
  if (site !== undefined && !['same-origin', 'same-site', 'none', 'cross-site'].includes(site)) {
    return deny('malformed sec-fetch-site header');
  }
  if (site === 'cross-site') return deny('cross-site request');

  const origin = values.origin;
  if (origin !== undefined) {
    if (!hosts.some((h) => origin === `http://${h}`)) return deny('origin not allowed');
    return { allow: true };
  }

  const method = req.method.toUpperCase();
  if (req.isUpgrade) return deny('websocket upgrade without origin');
  if (!SAFE_METHODS.has(method)) return deny(`${method} without origin`);
  if (site !== undefined && site !== 'none' && site !== 'same-origin') return deny(`${site} request without origin`);
  return { allow: true };
}
