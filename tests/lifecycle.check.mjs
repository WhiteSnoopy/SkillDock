import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const immutability = await fs.readFile(
  path.join(root, 'src-api', 'src', 'lifecycle', 'version-immutability.ts'),
  'utf8'
);
const lifecycleService = await fs.readFile(
  path.join(root, 'src-api', 'src', 'lifecycle', 'deprecate-revoke-service.ts'),
  'utf8'
);
const rollback = await fs.readFile(
  path.join(root, 'src-api', 'src', 'lifecycle', 'rollback-service.ts'),
  'utf8'
);

if (!immutability.includes('immutable')) {
  throw new Error('Immutable version guard is missing');
}

if (!lifecycleService.includes('deprecated') || !lifecycleService.includes('revoked')) {
  throw new Error('Deprecate/revoke lifecycle states are missing');
}

if (!rollback.includes('promotionFrozen')) {
  throw new Error('Rollback promotion freeze behavior is missing');
}

console.log('lifecycle.check passed');
