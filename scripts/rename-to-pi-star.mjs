#!/usr/bin/env node
// Rename all pi packages to pi-star packages

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('packages/*/package.json');

for (const f of files) {
  const content = readFileSync(f, 'utf-8');
  let pkg = JSON.parse(content);

  const oldName = pkg.name;
  const newName = oldName.replace('@earendil-works/pi-', '@b67687/pi-star-');
  pkg.name = newName;

  // Internal dependency refs
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (pkg[depType]) {
      const updated = {};
      for (const [k, v] of Object.entries(pkg[depType])) {
        updated[k.replace('@earendil-works/pi-', '@b67687/pi-star-')] = v;
      }
      pkg[depType] = updated;
    }
  }

  // Binary
  if (pkg.bin && pkg.bin.pi) {
    pkg.bin['pi-star'] = pkg.bin.pi;
    delete pkg.bin.pi;
  }

  // Repository
  if (pkg.repository?.url) {
    pkg.repository.url = 'git+https://github.com/B67687/pi-star.git';
  }
  if (pkg.repository?.directory) {
    pkg.repository.directory = pkg.repository.directory.replace('pi-mono', 'pi-star');
  }

  // Keywords
  if (pkg.keywords) {
    pkg.keywords = pkg.keywords.map(k => k === 'pi' ? 'pi-star' : k);
    if (!pkg.keywords.includes('pi-star')) pkg.keywords.push('pi-star');
  }

  writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ${oldName} → ${newName}`);
}

// Root package.json
const root = JSON.parse(readFileSync('package.json', 'utf-8'));
root.name = 'pi-star-monorepo';
root.description = 'Pi-Star: synthesized agent harness';
writeFileSync('package.json', JSON.stringify(root, null, 2) + '\n');
console.log(`  Root: pi-monorepo → pi-star-monorepo`);
console.log('Done.');
