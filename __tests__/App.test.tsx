/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import MainStack from '../src/navigation/MainStack';

const mockInitBackend = jest.fn();
const mockRetryBackend = jest.fn();

// The SQLite JSI adapter needs a native runtime; stub the app's database
// module so the tree renders without a native database adapter.
jest.mock('../src/watermelondb/database', () => ({
  database: {
    get: jest.fn(() => {
      throw new Error('no database in the render smoke test');
    }),
    write: jest.fn(async (work: () => Promise<unknown>) => work()),
    batch: jest.fn(),
  },
  getDatabaseError: () => null,
  waitForDatabase: jest.fn(async () => undefined),
}));

jest.mock('../src/backend', () => ({
  initBackend: (...args: unknown[]) => mockInitBackend(...args),
  retryBackend: (...args: unknown[]) => mockRetryBackend(...args),
}));

jest.mock('../src/navigation/MainStack', () => {
  const React = require('react');
  const MockMainStack = () => React.createElement('MainStack');
  return {
    __esModule: true,
    default: MockMainStack,
  };
});

jest.mock('redux-persist/integration/react', () => ({
  PersistGate: ({children}: {children: React.ReactNode}) => children,
}));

jest.mock('react-native-actions-sheet', () => ({
  SheetProvider: ({children}: {children: React.ReactNode}) => children,
  registerSheet: jest.fn(),
  SheetManager: {show: jest.fn()},
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({children}: {children: React.ReactNode}) => children,
}));

beforeEach(() => {
  mockInitBackend.mockReset().mockResolvedValue({ok: true});
  mockRetryBackend.mockReset().mockResolvedValue({ok: true});
});

test('renders the main stack after initialization succeeds', async () => {
  let resolveInit!: (result: {ok: true}) => void;
  const initPromise = new Promise<{ok: true}>(resolve => {
    resolveInit = resolve;
  });
  mockInitBackend.mockReturnValue(initPromise);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
  expect(mockInitBackend).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findAllByType(MainStack)).toHaveLength(0);
  await ReactTestRenderer.act(async () => {
    resolveInit({ok: true});
    await initPromise;
    await Promise.resolve();
  });
  expect(renderer!.root.findAllByType(MainStack)).toHaveLength(1);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
});

test('keeps the main stack unmounted while initialization is pending', async () => {
  mockInitBackend.mockReturnValue(new Promise(() => undefined));
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
  expect(renderer!.root.findAllByType(MainStack)).toHaveLength(0);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
});

test('blocks the main stack and exposes retry for migration failures', async () => {
  let resolveInit!: (result: {ok: false; kind: 'migration'; retryable: true; error: Error}) => void;
  const initPromise = new Promise<{ok: false; kind: 'migration'; retryable: true; error: Error}>(resolve => {
    resolveInit = resolve;
  });
  mockInitBackend.mockReturnValue(initPromise);
  const migrationFailure = {
    ok: false,
    kind: 'migration',
    retryable: true,
    error: new Error('migration failed'),
  } as const;

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
  expect(mockInitBackend).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    resolveInit(migrationFailure);
    await initPromise;
  });
  expect(renderer!.root.findAllByType(MainStack)).toHaveLength(0);

  const retry = renderer!.root.findByProps({accessibilityLabel: 'Retry'});
  let resolveRetry!: (result: {ok: true}) => void;
  const retryPromise = new Promise<{ok: true}>(resolve => {
    resolveRetry = resolve;
  });
  mockRetryBackend.mockReturnValue(retryPromise);
  await ReactTestRenderer.act(async () => {
    retry.props.onPress();
    await Promise.resolve();
  });
  expect(mockRetryBackend).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    resolveRetry({ok: true});
    await retryPromise;
    await Promise.resolve();
  });
  expect(renderer!.root.findAllByType(MainStack)).toHaveLength(1);
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
});
