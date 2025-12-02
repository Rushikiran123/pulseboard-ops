const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const SALT_ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken({ userId, organizationId, role }) {
  return jwt.sign({ sub: userId, organizationId, role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

function verifyToken(token) {
  const decoded = jwt.verify(token, env.jwt.secret);
  return {
    userId: decoded.sub,
    organizationId: decoded.organizationId,
    role: decoded.role,
  };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
