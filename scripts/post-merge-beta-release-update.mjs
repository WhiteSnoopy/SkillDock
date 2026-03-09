import fs from 'node:fs/promises';
import path from 'node:path';

const payloadPath = process.env.GITHUB_EVENT_PATH;
if (!payloadPath) {
  throw new Error('GITHUB_EVENT_PATH is required');
}

const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
const pr = payload.pull_request;

if (!pr || !pr.merged || !pr.title.startsWith('beta-release:')) {
  console.log('Not a merged beta-release PR. Skip update.');
  process.exit(0);
}

const match = pr.title.match(/^beta-release:\s*([a-z0-9-]+)@([0-9A-Za-z.-]+)$/);
if (!match) {
  throw new Error('PR title format invalid for beta release update');
}

const [, skillId, version] = match;
const registryRoot = path.join(process.cwd(), 'registry', 'skills', skillId);
const channelsPath = path.join(registryRoot, 'channels.json');
const releasesDir = path.join(registryRoot, 'releases');

const channelsRaw = await fs.readFile(channelsPath, 'utf8');
const channels = JSON.parse(channelsRaw);
channels.channels = { ...channels.channels, beta: version };
channels.updated_at = new Date().toISOString();

await fs.writeFile(channelsPath, `${JSON.stringify(channels, null, 2)}\n`, 'utf8');
console.log(`Updated beta pointer for ${skillId} -> ${version}`);

const entries = await fs.readdir(releasesDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
  const fullPath = path.join(releasesDir, entry.name);
  const release = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  if (release.version === version && release.target_channel === 'beta') {
    release.merged_at = new Date().toISOString();
    release.merge_pr = pr.number;
    await fs.writeFile(fullPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
    console.log(`Updated release audit record: ${entry.name}`);
  }
}
