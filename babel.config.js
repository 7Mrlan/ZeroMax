const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  // RN 0.87's Hermes profile preserves class fields. WatermelonDB's legacy
  // decorators need Babel's default class transform in Jest only; Metro keeps
  // the Hermes-stable profile for production/runtime parity.
  presets: [['module:@react-native/babel-preset', isTest ? {unstable_transformProfile: 'default'} : {}]],
  plugins: [
    ['@babel/plugin-proposal-decorators', {legacy: true}],
    '@babel/plugin-transform-export-namespace-from',
    'react-native-worklets/plugin', // Must be listed last
  ],
};
