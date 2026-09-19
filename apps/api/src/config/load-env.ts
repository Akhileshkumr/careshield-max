import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';

// Searches upward because npm runs each workspace script with that workspace as the
// cwd, while .env lives at the repo root. A fixed relative path would be wrong for at
// least one of dist/main.js, tsx src/db/migrate.ts and jest.
function loadNearestEnv(): void {
  let directory = process.cwd();

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }

    const parent = dirname(directory);
    if (parent === directory) return; // reached the filesystem root
    directory = parent;
  }
}

loadNearestEnv();
