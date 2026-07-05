/**
 * Simple in-memory rate limiter (per IP, resets on process restart).
 * Used to protect the login endpoint against brute-force attempts.
 */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

/**
 * Returns true if the request should be blocked.
 * @param key      Usually the client IP address.
 * @param limit    Max allowed requests in the window.
 * @param windowMs Time window in milliseconds.
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count++;
  if (bucket.count > limit) return true;
  return false;
}

/**
 * Per-account failed-login tracking, for a temporary lockout after too many wrong
 * passwords. Separate from isRateLimited because we must (a) check lock state before
 * verifying the password, (b) count only *failed* attempts, and (c) clear the counter
 * on a successful login — three operations isRateLimited collapses into one.
 *
 * ponytail: in-memory + per-process, so it resets on restart and isn't shared across
 * instances (same ceiling as isRateLimited). For a multi-instance deploy, back this
 * with a shared store (Redis) or User.failedLoginCount/lockedUntil columns.
 */
const failStore = new Map<string, Bucket>();

/** True if this key has reached `limit` failures within the current window. */
export function isLockedOut(key: string, limit: number, windowMs: number): boolean {
  const b = failStore.get(key);
  if (!b || Date.now() > b.resetAt) return false;
  return b.count >= limit;
}

/** Record one failed attempt, opening a fresh window if none is active. */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const b = failStore.get(key);
  if (!b || now > b.resetAt) {
    failStore.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
}

/** Clear a key's failure count (call on successful login). */
export function clearFailures(key: string): void {
  failStore.delete(key);
}

/**
 * Extracts the client IP for rate-limiting.
 *
 * Behind a single reverse proxy (nginx — see DEPLOYMENT.md), prefer X-Real-IP,
 * which the proxy sets to the real socket peer and a client cannot forge through.
 * Fall back to the LAST entry of X-Forwarded-For — the hop the proxy appended —
 * never the first entry, which is attacker-controlled and would let a brute-forcer
 * rotate to a fresh bucket on every request.
 *
 * ponytail: assumes exactly one trusted proxy in front. If a second proxy is ever
 * added, take the second-to-last X-Forwarded-For entry instead.
 */
export function getClientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}
