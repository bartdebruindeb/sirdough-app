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
