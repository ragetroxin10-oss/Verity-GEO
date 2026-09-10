// Simple in-memory sliding-window rate limiter, keyed by IP address.
//
// This is intentionally lightweight so the project runs with zero extra
// infrastructure. It works well on a single long-running Node process
// (Render, Railway, Fly.io, a VPS, `next start`). On serverless platforms
// with multiple instances or frequent cold starts (e.g. Vercel functions
// under load), each instance keeps its own counts, so the effective limit
// can be higher than configured. For strict enforcement at scale, swap
// this for a shared store such as Upstash Redis (@upstash/ratelimit) -
// the checkRateLimit() call site in app/api/claude/route.js won't need
// to change shape, only this file's implementation.

const buckets = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_HOUR || "20", 10);

export function checkRateLimit(key) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now - entry.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
