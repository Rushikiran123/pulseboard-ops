const { requireAuth, requireRole } = require('../middleware/auth');
const { signToken } = require('../services/authService');

function buildRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('requireAuth', () => {
  it('rejects requests with no Authorization header', () => {
    const req = { headers: {} };
    const res = buildRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header', () => {
    const req = { headers: { authorization: 'Token abc' } };
    const res = buildRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid/expired token', () => {
    const req = { headers: { authorization: 'Bearer garbage.token.value' } };
    const res = buildRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches decoded claims to req.user and calls next() for a valid token', () => {
    const token = signToken({ userId: 'u1', organizationId: 'org1', role: 'admin' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = buildRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'u1', organizationId: 'org1', role: 'admin' });
  });
});

describe('requireRole', () => {
  it('calls next() when the user has an allowed role', () => {
    const req = { user: { role: 'owner' } };
    const res = buildRes();
    const next = jest.fn();

    requireRole('owner', 'admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when the user role is not permitted', () => {
    const req = { user: { role: 'member' } };
    const res = buildRes();
    const next = jest.fn();

    requireRole('owner', 'admin')(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no authenticated user at all', () => {
    const req = {};
    const res = buildRes();
    const next = jest.fn();

    requireRole('owner')(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});
