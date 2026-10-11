'use strict';

const fs = require('node:fs');
const path = require('node:path');

const marker = '# ZERO_PNPM_NATIVE_PATHS';
const packageRoot = path.dirname(require.resolve('@nozbe/watermelondb'));
const cmakePath = path.join(packageRoot, 'native/android-jsi/src/main/cpp/CMakeLists.txt');
const projectRoot = process.env.INIT_CWD || process.cwd();
const nodeModulesPath = path.resolve(projectRoot, 'node_modules');
const original = fs.readFileSync(cmakePath, 'utf8');
const bumped = original.replace(/set\(WMELON_JSI_BUMP \d+\)/, 'set(WMELON_JSI_BUMP 5)');
const normalizedNodeModulesPath = nodeModulesPath.replace(/\\/g, '/');

if (!bumped.includes(marker)) {
  const anchor = 'endif()\n\n# -------------------------------------------------\n# Header search paths';
  if (!original.includes(anchor)) {
    throw new Error('WatermelonDB JSI CMake anchor changed; inspect the dependency before patching');
  }
  const nativePaths = `${anchor.split('\n# Header')[0]}\n\n${marker}\nset(NODE_MODULES_PATH_WM "${normalizedNodeModulesPath}")\nset(NODE_MODULES_PATH_RN "${normalizedNodeModulesPath}")\n\n# Header search paths`;
  fs.writeFileSync(cmakePath, bumped.replace(anchor, nativePaths));
} else {
  const patched = bumped
    .replace(/set\(NODE_MODULES_PATH_WM "[^"]+"\)/, `set(NODE_MODULES_PATH_WM "${normalizedNodeModulesPath}")`)
    .replace(/set\(NODE_MODULES_PATH_RN "[^"]+"\)/, `set(NODE_MODULES_PATH_RN "${normalizedNodeModulesPath}")`);
  if (patched !== original) {
    fs.writeFileSync(cmakePath, patched);
  }
}

console.log(`WatermelonDB JSI CMake paths prepared: ${cmakePath}`);
