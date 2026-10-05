import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: scryptSync(String(pin), salt, 32).toString('hex') };
}

export function checkPin(pin, stored) {
  if (!stored) return false;
  const expected = Buffer.from(stored.hash, 'hex');
  const actual = scryptSync(String(pin ?? ''), Buffer.from(stored.salt, 'hex'), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Fixed-window limiter keyed by string. Returns true when the call is allowed. */
export function createLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

/** Short-lived bearer tokens for the host console. */
export function createSessions({ ttlMs = 12 * 60 * 60 * 1000, now = Date.now } = {}) {
  const tokens = new Map();
  return {
    issue() {
      const token = randomBytes(24).toString('hex');
      tokens.set(token, now() + ttlMs);
      return token;
    },
    valid(token) {
      const exp = tokens.get(token);
      if (!exp) return false;
      if (exp < now()) {
        tokens.delete(token);
        return false;
      }
      return true;
    },
    revokeAll: () => tokens.clear(),
  };
}

/**
 * A request counts as local only if it reached us directly over loopback with no
 * proxy headers. A Cloudflare Tunnel connects from 127.0.0.1 too, but adds
 * forwarding headers, so tunnelled traffic is correctly treated as remote.
 */
export function isLocalRequest(req) {
  const addr = req.socket?.remoteAddress ?? '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const proxied = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded', 'x-forwarded-host'].some((h) => req.headers[h]);
  return loopback && !proxied;
}

export function clientIp(req) {
  return req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}
