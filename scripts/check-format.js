#!/usr/bin/env node

/**
 * Checks only files changed by the current commit/PR. The upstream Zero
 * baseline has a recorded formatting backlog; gating every historical file
 * would mix mechanical churn into functional changes. A later style commit
 * can raise this to a full-tree check without weakening changed-file review.
 */
const {execFileSync, spawnSync} = require('node:child_process');

const extensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml']);

const runGit = args => {
  try {
    return execFileSync('git', args, {encoding: 'utf8'});
  } catch {
    return '';
  }
};

const hasRevision = revision => {
  try {
    execFileSync('git', ['rev-parse', '--verify', revision], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

const base = process.env.FORMAT_BASE_SHA;
const ranges = [];
if (base && hasRevision(base)) {
  ranges.push([base, 'HEAD']);
} else if (base) {
  console.warn(`format: base revision ${base} is unavailable; falling back to HEAD^`);
}
if (ranges.length === 0 && hasRevision('HEAD^')) {
  ranges.push(['HEAD^', 'HEAD']);
}
const names = new Set();

for (const [from, to] of ranges) {
  const output = runGit(['diff', '--name-only', '--diff-filter=ACMR', `${from}...${to}`]);
  output
    .split('\n')
    .filter(Boolean)
    .forEach(name => names.add(name));
}

if (ranges.length === 0) {
  runGit(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .forEach(name => names.add(name));
}

runGit(['diff', '--name-only', '--diff-filter=ACMR'])
  .split('\n')
  .filter(Boolean)
  .forEach(name => names.add(name));
runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  .split('\n')
  .filter(Boolean)
  .forEach(name => names.add(name));

const files = [...names].filter(name => {
  if (name.startsWith('zero/') || name.startsWith('zerox/') || name.startsWith('android/') || name.startsWith('ios/')) {
    return false;
  }
  const dot = name.lastIndexOf('.');
  return dot >= 0 && extensions.has(name.slice(dot));
});

if (files.length === 0) {
  console.log('format: no changed source/document files to check');
  process.exit(0);
}

const result = spawnSync('prettier', ['--check', ...files], {stdio: 'inherit'});
process.exit(result.status ?? 1);
