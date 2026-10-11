const babelParser = require('@babel/eslint-parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const reactNative = require('eslint-plugin-react-native');
const globals = require('globals');

/**
 * TypeScript 7 is the compiler of record. The RN preset's typescript-eslint
 * plugin currently rejects TS 7, so lint parsing is syntax-only through Babel;
 * semantic checks remain in `pnpm run typecheck`.
 */
module.exports = [
  {
    ignores: [
      'references/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'vendor/**',
      'node_modules/**',
      'zero/**',
      'zerox/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['module:@react-native/babel-preset'],
          plugins: [['@babel/plugin-proposal-decorators', {legacy: true}]],
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.es2021,
        ...globals.node,
        __DEV__: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {react, 'react-hooks': reactHooks, 'react-native': reactNative},
    settings: {react: {version: 'detect'}},
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Dynamic theme/inset/animation values cannot live in StyleSheet.create;
      // TypeScript and code review cover these typed style objects instead.
      'react-native/no-inline-styles': 'off',
      'react-native/no-raw-text': 'off',
    },
  },
  {
    files: ['jest.setup.js', 'jest.config.js', 'src/testing/**'],
    languageOptions: {
      globals: {jest: 'readonly', require: 'readonly', module: 'writable'},
    },
  },
];
