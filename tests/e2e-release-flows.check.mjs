import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const betaApproval = await fs.readFile(
  path.join(root, '.github', 'workflows', 'beta-release-approval.yml'),
  'utf8'
);
const promoteApproval = await fs.readFile(
  path.join(root, '.github', 'workflows', 'promote-stable-approval.yml'),
  'utf8'
);
const promoteScript = await fs.readFile(
  path.join(root, 'scripts', 'enforce-promote-stable-approval.mjs'),
  'utf8'
);

if (!betaApproval.includes('beta-release PR requires supervisor approval')) {
  throw new Error('Missing supervisor approval enforcement for beta-release');
}

if (!promoteScript.includes('promote-stable PR requires supervisor approval')) {
  throw new Error('Missing supervisor approval enforcement for promote-stable');
}

if (!promoteScript.includes('promote-stable PR must be opened by owner')) {
  throw new Error('Missing owner-only enforcement for promote-stable');
}

console.log('e2e-release-flows.check passed');
