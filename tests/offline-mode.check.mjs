import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const startup = await fs.readFile(
  path.join(root, 'src-api', 'src', 'bootstrap', 'startup-sync.ts'),
  'utf8'
);
const guard = await fs.readFile(
  path.join(root, 'src-api', 'src', 'install', 'offline-install-guard.ts'),
  'utf8'
);
const mutationGuard = await fs.readFile(
  path.join(root, 'src-api', 'src', 'services', 'release-mutation-guard.ts'),
  'utf8'
);

if (!startup.includes('mode: "offline"')) {
  throw new Error('Startup offline mode behavior is missing');
}

if (!guard.includes('hasVerifiedArtifact')) {
  throw new Error('Offline verified artifact guard is missing');
}

if (!mutationGuard.includes('Remote release mutation is blocked while offline')) {
  throw new Error('Offline release mutation blocking is missing');
}

console.log('offline-mode.check passed');
