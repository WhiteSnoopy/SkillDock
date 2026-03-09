import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const policyEngine = await fs.readFile(
  path.join(root, 'src-api', 'src', 'install', 'team-policy-engine.ts'),
  'utf8'
);
const decisionService = await fs.readFile(
  path.join(root, 'src-api', 'src', 'install', 'install-decision-service.ts'),
  'utf8'
);

if (!policyEngine.includes('explicit_block') || !policyEngine.includes('explicit_allow')) {
  throw new Error('Policy precedence logic is missing expected reasons');
}

if (!policyEngine.includes('stable-only')) {
  throw new Error('Default stable-only policy mode is missing');
}

if (!decisionService.includes('INTEGRITY_CHECKSUM_FAILED')) {
  throw new Error('Integrity checksum deny path is missing');
}

console.log('policy-integrity.check passed');
