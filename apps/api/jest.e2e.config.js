/**
 * Integration tests: boot the real Nest app against a real PostgreSQL started
 * by Testcontainers. These are the tests that prove the parts worth proving —
 * rollback on payment failure, the server-side expiry gate, and idempotent
 * concurrent checkout — none of which can be demonstrated against a mock.
 *
 * Run with --runInBand: the suites share one container and assert on row
 * counts, so they must not interleave.
 */
module.exports = {
  rootDir: 'test',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 180_000,
  clearMocks: true,
};
