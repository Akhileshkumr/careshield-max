import type { NextConfig } from 'next';

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
