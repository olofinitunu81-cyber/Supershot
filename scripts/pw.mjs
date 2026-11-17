// Loads the globally installed Playwright (pre-installed in CI/dev containers)
// or a locally installed one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(`${root}/playwright`);
  }
}
