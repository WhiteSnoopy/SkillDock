import fs from 'node:fs/promises';
import path from 'node:path';

const payloadPath = process.env.GITHUB_EVENT_PATH;
if (!payloadPath) throw new Error('GITHUB_EVENT_PATH is required');

const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
const pr = payload.pull_request;
if (!pr || !pr.merged || !pr.title.startsWith('promote-stable:')) {
  console.log('Not a merged promote-stable PR. Skip.');
  process.exit(0);
}

const match = pr.title.match(/^promote-stable:\s*([a-z0-9-]+)@([0-9A-Za-z.-]+)$/);
if (!match) throw new Error('Invalid promote-stable PR title format');

const [, skillId, version] = match;
const root = path.join(process.cwd(), 'registry', 'skills', skillId);
const channelsPath = path.join(root, 'channels.json');
const releasesDir = path.join(root, 'releases');

const channels = JSON.parse(await fs.readFile(channelsPath, 'utf8'));
channels.channels = { ...channels.channels, stable: version };
channels.updated_at = new Date().toISOString();
await fs.writeFile(channelsPath, `${JSON.stringify(channels, null, 2)}\n`);

const entries = await fs.readdir(releasesDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
  const full = path.join(releasesDir, entry.name);
  const release = JSON.parse(await fs.readFile(full, 'utf8'));
  if (release.version === version) {
    release.promoted_to_stable_at = new Date().toISOString();
    release.promote_pr = pr.number;
    await fs.writeFile(full, `${JSON.stringify(release, null, 2)}\n`);
  }
}

console.log(`Updated stable pointer for ${skillId} -> ${version}`);
