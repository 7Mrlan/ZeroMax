/**
 * Flat config (ESLint 9+). Replaces the legacy .eslintrc.js — ESLint 10
 * dropped eslintrc support entirely, and ESLint is pinned to ^9 because
 * eslint-plugin-react-hooks / eslint-plugin-react / @babel/eslint-parser
 * all cap their peer range at 9.
 */
const reactNativeConfig = require('@react-native/eslint-config/flat');

// The RN config ships Flow lint rules (eslint-plugin-ft-flow) for **/*.js.
// This codebase is TypeScript-only, and the pinned ft-flow@2 calls
// context.getAllComments(), removed in ESLint 9 — it crashes the whole run.
// Dropping the block is correct here rather than force-resolving ft-flow@3.
const withoutFlowRules = reactNativeConfig.filter(
  entry => !entry.plugins?.['ft-flow'],
);

module.exports = [
  {
    ignores: [
      'references/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'vendor/**',
      'node_modules/**',
    ],
  },
  ...withoutFlowRules,
  {
    // Test setup/preload files run in the test runner, not the app.
    files: ['jest.setup.js', 'jest.config.js', 'bun-preload.ts', 'src/testing/**'],
    languageOptions: {
      globals: {jest: 'readonly', require: 'readonly', module: 'writable'},
    },
  },
];
