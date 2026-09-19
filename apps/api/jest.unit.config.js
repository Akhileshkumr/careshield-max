/**
 * Unit tests: pure functions only — pricing, underwriting, money, FSM.
 * No database, no network, so these run in milliseconds and need no Docker.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};
