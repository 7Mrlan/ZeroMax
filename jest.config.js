module.exports = {
  // Moved out of the react-native package in RN 0.85.
  preset: '@react-native/jest-preset',
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js', './jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/references/', '/zero/', '/zerox/'],
  modulePathIgnorePatterns: ['<rootDir>/zero/', '<rootDir>/zerox/'],
  moduleNameMapper: {
    // lucide 1.x resolves to an .mjs bundle under the RN preset's conditions,
    // which jest cannot parse. Point tests at its CommonJS build instead.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      // pnpm stores packages under .pnpm/<pkg>/node_modules/<pkg>. Keep the
      // nested prefix optional so the same allow-list works with npm/pnpm.
      '(?:\\.pnpm/[^/]+/node_modules/)?' +
      '(?:@react-native|@react-native-community|react-native|' +
      '@react-navigation|@nozbe/watermelondb|react-native-actions-sheet|' +
      'react-native-reanimated|react-native-worklets|react-native-gesture-handler|' +
      'react-native-safe-area-context|@shopify/flash-list|react-native-svg|' +
      'lucide-react-native|react-native-mmkv|react-native-fs|@react-native-documents|' +
      'react-redux|redux-persist|immer|reselect|nanoid)' +
      ')/)',
  ],
};
