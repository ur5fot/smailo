import { lookup } from 'dns/promises';
import https from 'node:https';

/**
 * Check if a hostname or IP is private/loopback/reserved.
 * Shared SSRF protection for cron fetch_url and action fetchUrl.
 */
export function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 0) return true;    // 0.0.0.0/8
    if (a === 127) return true;  // loopback
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT RFC 6598
  }
  const bare = hostname.replace(/^\[|\]$/g, '');
  // Only apply IPv6 prefix checks to actual IPv6 addresses (contain ':')
  // to avoid false positives on hostnames like fcsomething.com or fdrive.com
  if (bare.includes(':')) {
    if (
      bare === '::1' ||
      bare === '::' ||
      bare.toLowerCase().startsWith('fc') ||
      bare.toLowerCase().startsWith('fd') ||
      bare.toLowerCase().startsWith('fe80') || // link-local
      bare.toLowerCase().startsWith('ff')       // multicast
    ) return true;
  }
  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:aabb:ccdd)
  const ipv4MappedHex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (ipv4MappedHex) {
    const hi = parseInt(ipv4MappedHex[1], 16);
    const a = hi >> 8;
    const b = hi & 0xff;
    const lo = parseInt(ipv4MappedHex[2], 16);
    const c = lo >> 8;
    const d = lo & 0xff;
    return isPrivateHost(`${a}.${b}.${c}.${d}`);
  }
  const ipv4MappedDot = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedDot) {
    return isPrivateHost(ipv4MappedDot[1]);
  }
  return false;
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

/**
 * Fetch an HTTPS URL with SSRF protection:
 * - Private IP / loopback blocked
 * - DNS rebinding check (resolve before connect, pin IP)
 * - Redirect blocking (3xx → error)
 * - 1 MB body limit
 * - 10s timeout
 *
 * Returns raw body string and content type.
 * Throws on any failure (caller handles).
 */
export async function fetchSafe(url: string): Promise<{ body: string; contentType: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(`Non-HTTPS URL rejected: ${url}`);
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    throw new Error(`Private/loopback URL rejected: ${url}`);
  }

  // DNS rebinding check: resolve before connecting, then pin the IP
  let resolvedIp: string;
  try {
    const result = await lookup(parsedUrl.hostname);
    resolvedIp = result.address;
  } catch {
    throw new Error(`DNS lookup failed for: ${url}`);
  }

  if (isPrivateHost(resolvedIp)) {
    throw new Error(`DNS resolved to private IP ${resolvedIp}: ${url}`);
  }

  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;
  const path = parsedUrl.pathname + parsedUrl.search;

  type FetchResult =
    | { ok: true; body: Buffer; contentType: string }
    | { ok: false; reason: 'redirect' | 'too_large' | 'error'; detail?: unknown };

  const fetchResult: FetchResult = await new Promise((resolve) => {
    let settled = false;
    const done = (r: FetchResult) => { if (!settled) { settled = true; resolve(r); } };

    const req = https.request(
      {
        hostname: resolvedIp,
        port,
        path,
        method: 'GET',
        headers: { Host: parsedUrl.hostname },
        servername: parsedUrl.hostname,
        rejectUnauthorized: true,
      },
      (res) => {
        if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400) {
          res.destroy();
          done({ ok: false, reason: 'redirect' });
          return;
        }
        const cl = res.headers['content-length'];
        if (cl && parseInt(cl as string, 10) > MAX_BODY_BYTES) {
          res.destroy();
          done({ ok: false, reason: 'too_large' });
          return;
        }
        const chunks: Buffer[] = [];
        let totalSize = 0;
        res.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_BODY_BYTES) {
            res.destroy();
            done({ ok: false, reason: 'too_large' });
          } else {
            chunks.push(chunk);
          }
        });
        res.on('end', () => done({
          ok: true,
          body: Buffer.concat(chunks),
          contentType: (res.headers['content-type'] as string) || '',
        }));
        res.on('error', (err) => done({ ok: false, reason: 'error', detail: err }));
      }
    );
    req.setTimeout(10_000, () => {
      req.destroy();
      done({ ok: false, reason: 'error', detail: new Error('Request timeout') });
    });
    req.on('error', (err) => done({ ok: false, reason: 'error', detail: err }));
    req.end();
  });

  if (!fetchResult.ok) {
    if (fetchResult.reason === 'redirect') {
      throw new Error(`Redirect rejected: ${url}`);
    } else if (fetchResult.reason === 'too_large') {
      throw new Error(`Body exceeds 1 MB: ${url}`);
    } else {
      throw new Error(`Request failed: ${fetchResult.detail}`);
    }
  }

  return {
    body: fetchResult.body.toString('utf8'),
    contentType: fetchResult.contentType,
  };
}

const BLOCKED_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Extract a value from a response body using a dot-notation dataPath.
 * - If body is not valid JSON → returns raw string.
 * - If dataPath is absent → returns parsed JSON (or raw string if not JSON).
 * - If dataPath key is missing → returns null.
 */
export function extractDataPath(body: string, dataPath?: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body; // not JSON → raw string
  }

  if (!dataPath) {
    return parsed;
  }

  const parts = dataPath.replace(/^\$\./, '').split('.');
  let current: unknown = parsed;
  for (const part of parts) {
    if (BLOCKED_PATH_KEYS.has(part)) return null;
    if (current != null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return current === undefined ? null : current;
}
