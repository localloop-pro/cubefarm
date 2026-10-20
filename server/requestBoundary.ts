/** Browser CSRF/DNS-rebinding mitigation, not authentication against local processes. */
export interface OfficeRequest {
  method: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Supply IncomingMessage.rawHeaders at the adapter: Node can discard duplicate Host headers. */
  rawHeaders?: readonly string[];
  url: string;
  isUpgrade: boolean;
}

export interface OfficeBoundary {
  port: number;
  dev?: boolean;
  clientPort?: number;
}

export type OfficeDecision = { allow: true } | { allow: false; status: 403; reason: string };

const sensitive = ['host', 'origin', 'sec-fetch-site'] as const;
type Header = typeof sensitive[number];
const deny = (reason: string): OfficeDecision => ({ allow: false, status: 403, reason });
const validPort = (port: number) => Number.isInteger(port) && port > 0 && port <= 65535;

/** Strict spelling avoids URL parsers normalizing alternate IP forms, suffixes or credentials. */
function authority(value: string, ports: readonly number[]): boolean {
  const match = /^(localhost|127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/.exec(value);
  return !!match && ports.includes(Number(match[2]));
}

function readHeaders(request: OfficeRequest): Partial<Record<Header, string>> | null {
  const values: Partial<Record<Header, string>> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const key = name.toLowerCase() as Header;
    if (!sensitive.includes(key) || value === undefined) continue;
    if (typeof value !== 'string' || values[key] !== undefined || !value || /[\s,]/.test(value)) return null;
    values[key] = value;
  }
  if (request.rawHeaders !== undefined) {
    if (request.rawHeaders.length % 2) return null;
    const seen = new Set<string>();
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      const name = request.rawHeaders[i];
      const value = request.rawHeaders[i + 1];
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return null;
      const key = name.toLowerCase() as Header;
      if (!sensitive.includes(key)) continue;
      if (seen.has(key) || value !== values[key]) return null;
      seen.add(key);
    }
    if (sensitive.some((key) => values[key] !== undefined && !seen.has(key))) return null;
  }
  return values;
}

/** Pure policy. Token-authenticated callback exceptions belong to the HTTP adapter, not here. */
export function officeRequest(request: OfficeRequest, boundary: OfficeBoundary): OfficeDecision {
  if (!validPort(boundary.port) || (boundary.dev && !validPort(boundary.clientPort ?? 0))) return deny('invalid-boundary');
  const ports = boundary.dev ? [boundary.port, boundary.clientPort!] : [boundary.port];
  const headers = readHeaders(request);
  if (!headers) return deny('malformed-headers');
  if (!headers.host || !authority(headers.host, ports)) return deny('untrusted-host');
  // Require an origin-form target. Paths and queries are legitimate; absolute/network-path URLs are not.
  if (!request.url.startsWith('/') || request.url.startsWith('//') || /[\x00-\x20\x7f\\#]/.test(request.url)) return deny('malformed-target');
  if (!/^[A-Z]+$/.test(request.method)) return deny('malformed-method');
  const site = headers['sec-fetch-site'];
  if (site === 'cross-site') return deny('cross-site');
  if (site !== undefined && !['none', 'same-origin', 'same-site'].includes(site)) return deny('malformed-fetch-site');
  if (headers.origin !== undefined) {
    if (!headers.origin.startsWith('http://') || !authority(headers.origin.slice(7), ports)) return deny('untrusted-origin');
  } else {
    // Browser WebSockets must provide Origin even though their handshake uses GET.
    if (request.isUpgrade || !['GET', 'HEAD'].includes(request.method)) return deny('origin-required');
    if (site === 'same-site') return deny('origin-required');
  }
  if (request.isUpgrade && request.method !== 'GET') return deny('invalid-upgrade-method');
  return { allow: true };
}
