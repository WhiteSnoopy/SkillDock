import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const checks = [
  'tests/tauri-project.check.mjs',
  'tests/startup-script.check.mjs',
  'tests/service-startup-smoke.check.mjs',
  'tests/desktop-integration.check.mjs',
  'tests/e2e-release-flows.check.mjs',
  'tests/policy-integrity.check.mjs',
  'tests/offline-mode.check.mjs',
  'tests/lifecycle.check.mjs'
];

for (const check of checks) {
  const { stdout } = await run('node', [check], { cwd: process.cwd() });
  process.stdout.write(stdout);
}

console.log('All checks passed');
