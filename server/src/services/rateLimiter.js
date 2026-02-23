/**
 * Redis-backed fixed-window rate limiter.
 *
 * Uses INCR + PEXPIRE, which every Redis-compatible client (real ioredis or
 * ioredis-mock in tests) implements identically, so the exact same code path
 * is exercised in production and in the unit suite.
 */

class RateLimiter {
  /**
   * @param {import('ioredis').Redis} redisClient
   * @param {{windowMs: number, max: number}} options
   */
  constructor(redisClient, { windowMs, max }) {
    this.redis = redisClient;
    this.windowMs = windowMs;
    this.max = max;
  }

  /**
   * @param {string} key - unique identifier for the caller (api key, org id, ip)
   * @returns {Promise<{allowed: boolean, remaining: number, resetMs: number, limit: number}>}
   */
  async consume(key) {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      await this.redis.pexpire(redisKey, this.windowMs);
    }

    let ttl = await this.redis.pttl(redisKey);
    if (ttl < 0) {
      // Key had no TTL (e.g. race condition) - repair it defensively.
      await this.redis.pexpire(redisKey, this.windowMs);
      ttl = this.windowMs;
    }

    const allowed = count <= this.max;
    return {
      allowed,
      remaining: Math.max(this.max - count, 0),
      resetMs: ttl,
      limit: this.max,
    };
  }

  middleware(keyFn) {
    return async (req, res, next) => {
      try {
        const key = keyFn(req);
        const result = await this.consume(key);
        res.set('X-RateLimit-Limit', String(result.limit));
        res.set('X-RateLimit-Remaining', String(result.remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));

        if (!result.allowed) {
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Please slow down.',
            retryAfterMs: result.resetMs,
          });
        }
        return next();
      } catch (err) {
        return next(err);
      }
    };
  }
}

module.exports = { RateLimiter };
