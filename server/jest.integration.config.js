// Optional integration tests that require a real MongoDB + Redis (e.g. via docker-compose).
// Not part of the default `npm test` run so the offline unit suite always stays green.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/setupEnv.js'],
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.test.js'],
};
