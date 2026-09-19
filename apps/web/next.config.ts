import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';

/**
 * Next.js only reads `.env` from its own project directory, but configuration
 * for this monorepo lives in a single `.env` at the repo root. This walks
 * upwards to find it and populates `process.env` before the server starts.
 *
 * next.config.ts is evaluated inside the Next server process, so values set
 * here are visible to Server Components and Server Actions — which is where
 * API_BASE_URL and SERVICE_TOKEN are read, and nowhere else.
 */
// Next only reads .env from its own directory, but configuration lives at the repo
// root. next.config.ts is evaluated in the server process, so values set here reach
// Server Components and Server Actions — which is the only place they are read.
// Next only reads .env from its own directory, but configuration lives at the repo
// root. next.config.ts is evaluated in the server process, so values set here reach
// Server Components and Server Actions — which is the only place they are read.
function loadNearestEnv(): void {
  let directory = process.cwd();

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return;
    }

    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

loadNearestEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * `@careshield/contracts` is published from the workspace as compiled CJS,
   * so it needs no transpilation here — but listing it keeps the boundary
   * explicit and means a switch to publishing raw TS would not break the build.
   */
  transpilePackages: ['@careshield/contracts'],

  /**
   * API_BASE_URL and SERVICE_TOKEN are deliberately NOT declared in `env` and
   * carry no NEXT_PUBLIC_ prefix, so Next.js cannot inline them into the
   * client bundle. They are read only inside Server Actions and RSC, where
   * `server-only` (see src/lib/api-client.ts) enforces it at build time.
   */
};

export default nextConfig;
