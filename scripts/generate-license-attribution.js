'use strict';

const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

const outputPath = process.argv[2] ?? 'docs/THIRD_PARTY_LICENSES.json';
const raw = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--json'], {encoding: 'utf8'}));
const entries = [];
const seen = new Set();

for (const [license, packages] of Object.entries(raw)) {
  for (const item of packages) {
    const versions = Array.isArray(item.versions) ? item.versions : [];
    const key = `${item.name}@${versions.join(',')}|${license}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name: item.name,
      versions,
      license,
      ...(item.author ? {author: item.author} : {}),
    });
  }
}

entries.sort((left, right) => `${left.name}|${left.license}`.localeCompare(`${right.name}|${right.license}`));
const document = {
  schemaVersion: 1,
  packageManager: 'pnpm@11.19.0',
  sourceCommand: 'pnpm licenses list --json',
  packages: entries,
};

fs.mkdirSync(require('node:path').dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`License attribution written: ${outputPath} (${entries.length} packages)`);
