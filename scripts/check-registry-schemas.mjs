import fs from 'node:fs/promises';
import path from 'node:path';

const schemaDir = path.join(process.cwd(), 'src-api', 'src', 'registry', 'schemas');
const files = ['index.schema.json', 'channels.schema.json', 'release.schema.json'];

for (const file of files) {
  const fullPath = path.join(schemaDir, file);
  const raw = await fs.readFile(fullPath, 'utf8');
  const json = JSON.parse(raw);

  if (!json.schema_version && !json.properties?.schema_version) {
    throw new Error(`Schema version field missing in ${file}`);
  }
}

console.log('Registry schema checks passed');
