const RedisMock = require('ioredis-mock');
const { RateLimiter } = require('../services/rateLimiter');

describe('RateLimiter', () => {
  let redis;

  beforeEach(() => {
    redis = new RedisMock();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('allows requests under the configured limit', async () => {
    const limiter = new RateLimiter(redis, { windowMs: 60_000, max: 5 });
    const result = await limiter.consume('tenant-a');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests once the limit is exceeded', async () => {
    const limiter = new RateLimiter(redis, { windowMs: 60_000, max: 3 });
    await limiter.consume('tenant-b');
    await limiter.consume('tenant-b');
    await limiter.consume('tenant-b');
    const fourth = await limiter.consume('tenant-b');
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('tracks separate counters per key', async () => {
    const limiter = new RateLimiter(redis, { windowMs: 60_000, max: 1 });
    const a = await limiter.consume('tenant-c');
    const b = await limiter.consume('tenant-d');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('resets the counter after the window expires', async () => {
    const limiter = new RateLimiter(redis, { windowMs: 50, max: 1 });
    const first = await limiter.consume('tenant-e');
    expect(first.allowed).toBe(true);

    const blocked = await limiter.consume('tenant-e');
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 120));

    const afterReset = await limiter.consume('tenant-e');
    expect(afterReset.allowed).toBe(true);
  });

  describe('middleware', () => {
    function buildRes() {
      return {
        headers: {},
        set(key, value) {
          this.headers[key] = value;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
    }

    it('calls next() when under the limit', async () => {
      const limiter = new RateLimiter(redis, { windowMs: 60_000, max: 5 });
      const middleware = limiter.middleware(() => 'req-key');
      const next = jest.fn();
      const res = buildRes();

      await middleware({}, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.headers['X-RateLimit-Limit']).toBe('5');
    });

    it('returns 429 once the limit is exceeded', async () => {
      const limiter = new RateLimiter(redis, { windowMs: 60_000, max: 1 });
      const middleware = limiter.middleware(() => 'req-key-2');
      const next = jest.fn();

      await middleware({}, buildRes(), next);
      const res2 = buildRes();
      await middleware({}, res2, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res2.statusCode).toBe(429);
      expect(res2.body.error).toBe('rate_limit_exceeded');
    });
  });
});
