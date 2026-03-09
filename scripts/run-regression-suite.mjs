import fs from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  path.join(process.cwd(), 'src-api', 'src', 'publish', 'beta-release-pr-generator.ts'),
  path.join(process.cwd(), 'src-api', 'src', 'install', 'install-decision-service.ts'),
  path.join(process.cwd(), 'src-api', 'src', 'authoring', 'authoring-service.ts')
];

for (const file of requiredFiles) {
  await fs.access(file);
}

console.log('Regression smoke checks passed');
