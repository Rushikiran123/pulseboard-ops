module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/setupEnv.js'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/src/__tests__/integration/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/src/__tests__/'],
};
