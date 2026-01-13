const { hashPassword, verifyPassword, signToken, verifyToken } = require('../services/authService');

describe('authService', () => {
  it('hashes a password and verifies the original matches', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toEqual('correct horse battery staple');
    const valid = await verifyPassword('correct horse battery staple', hash);
    expect(valid).toBe(true);
  });

  it('rejects an incorrect password against a stored hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const valid = await verifyPassword('wrong password', hash);
    expect(valid).toBe(false);
  });

  it('signs a JWT that can be verified and round-trips claims', () => {
    const token = signToken({ userId: 'user-1', organizationId: 'org-1', role: 'owner' });
    const decoded = verifyToken(token);
    expect(decoded).toEqual({ userId: 'user-1', organizationId: 'org-1', role: 'owner' });
  });

  it('throws when verifying a tampered token', () => {
    const token = signToken({ userId: 'user-1', organizationId: 'org-1', role: 'owner' });
    const tampered = `${token.slice(0, -2)}xx`;
    expect(() => verifyToken(tampered)).toThrow();
  });

  it('throws when verifying garbage input', () => {
    expect(() => verifyToken('not-a-real-token')).toThrow();
  });
});
