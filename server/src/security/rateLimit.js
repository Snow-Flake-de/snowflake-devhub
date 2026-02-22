import systemConfigRepository from "../core/systemConfigRepository.js";

const buckets = new Map();
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupIntervalStarted = false;

function startCleanupLoop() {
  if (cleanupIntervalStarted) {
    return;
  }

  cleanupIntervalStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets.entries()) {
      if (now - value.windowStart > value.windowMs * 2) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
}

function getScopeLimit(scope, rateConfig) {
  switch (scope) {
    case "auth":
      return rateConfig.authMax;
    case "public":
      return rateConfig.publicMax;
    default:
      return rateConfig.generalMax;
  }
}

export function createRateLimiter(scope = "general") {
  startCleanupLoop();

  return (req, res, next) => {
    const settings = systemConfigRepository.getFoundationSettings();
    const windowMs = settings.security.rateLimit.windowMs;
    const limit = getScopeLimit(scope, settings.security.rateLimit);

    const now = Date.now();
    const clientIp = getClientIp(req);
    const key = `${scope}:${clientIp}`;
    const existing = buckets.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      buckets.set(key, {
        count: 1,
        windowStart: now,
        windowMs,
      });

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(limit - 1));
      return next();
    }

    existing.count += 1;

    const remaining = Math.max(0, limit - existing.count);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (existing.count > limit) {
      const retryAfterSeconds = Math.ceil(
        (existing.windowStart + windowMs - now) / 1000
      );
      res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
      return res.status(429).json({
        error: "Too many requests",
        scope,
      });
    }

    return next();
  };
}
