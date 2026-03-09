import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.join(process.cwd(), 'src-api', 'src');
const files = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(full);
    }
  }
}

await walk(root);

for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  if (content.includes('eval(')) {
    throw new Error(`Security scan failed: eval found in ${file}`);
  }
}

console.log('Security scan checks passed');
