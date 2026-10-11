jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  },
}));

import StorageService from '../../../utils/asyncStorageService';
import {
  MIGRATION_CHECKPOINT_KEY,
  beginMigrationCheckpoint,
  persistMigrationCheckpoint,
  readMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../migrationCheckpoint';

const mockedStorage = StorageService as jest.Mocked<typeof StorageService>;

const makeCheckpoint = (overrides: Partial<MigrationCheckpoint> = {}): MigrationCheckpoint => ({
  schemaVersion: 1,
  generation: 1,
  state: 'pending',
  source: 'zero-v3',
  sourceFingerprint: 'source-a',
  backup: {status: 'pending'},
  target: {databaseName: 'watermelon_v4', attemptId: '1:source-a', status: 'missing'},
  ...overrides,
});

describe('migration checkpoint', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts generation one and persists a target attempt identity', () => {
    mockedStorage.getItemSync.mockReturnValue(null);
    const checkpoint = beginMigrationCheckpoint({source: 'zero-v3', sourceFingerprint: 'source-a'});
    expect(checkpoint).toEqual(makeCheckpoint());
    expect(mockedStorage.setItemSync).toHaveBeenCalledWith(MIGRATION_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  });

  it('increments generation after a valid previous marker', () => {
    mockedStorage.getItemSync.mockReturnValue(JSON.stringify(makeCheckpoint({generation: 4})));
    const checkpoint = beginMigrationCheckpoint({source: 'zerox-v3', sourceFingerprint: 'source-b'});
    expect(checkpoint.generation).toBe(5);
    expect(checkpoint.target.attemptId).toBe('5:source-b');
  });

  it('blocks on a corrupt marker instead of silently resetting it', () => {
    mockedStorage.getItemSync.mockReturnValue('{broken');
    expect(() => beginMigrationCheckpoint({source: 'zero-v3', sourceFingerprint: 'source-a'})).toThrow(
      'not valid JSON',
    );
  });

  it('fails closed when callers try to persist an invalid marker', () => {
    expect(() => persistMigrationCheckpoint({...makeCheckpoint(), generation: 0} as MigrationCheckpoint)).toThrow(
      'invalid migration checkpoint',
    );
    expect(() =>
      persistMigrationCheckpoint({...makeCheckpoint(), backup: {status: 'ready'}} as MigrationCheckpoint),
    ).toThrow('invalid migration checkpoint');
  });

  it('reports malformed persisted markers without treating them as missing', () => {
    mockedStorage.getItemSync.mockReturnValue(JSON.stringify({schemaVersion: 1}));
    expect(readMigrationCheckpoint()).toEqual({kind: 'invalid', error: expect.any(Error)});
  });
});
