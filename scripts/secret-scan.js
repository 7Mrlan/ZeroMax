'use strict';

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'})
  .split('\0')
  .filter(Boolean)
  .filter(file => !file.startsWith('node_modules/') && !file.startsWith('android/app/build/'));

const patterns = [
  {name: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/},
  {name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/},
  {name: 'Private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/},
  {name: 'Bearer token literal', pattern: /authorization\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._-]{20,}["']/i},
];

const findings = [];
for (const file of trackedFiles) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const {name, pattern} of patterns) {
    if (pattern.test(content)) findings.push(`${name}: ${file}`);
  }
}

if (findings.length > 0) {
  console.error('Potential secrets detected:');
  findings.forEach(finding => console.error(`- ${finding}`));
  process.exit(1);
}
console.log(`Secret scan passed (${trackedFiles.length} tracked files checked)`);
