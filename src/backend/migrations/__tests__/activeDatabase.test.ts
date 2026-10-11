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
  LEGACY_DATABASE_NAME,
  TARGET_DATABASE_NAME,
  getActiveDatabaseName,
  beginFreshTargetOwnership,
  persistFreshTargetOwnership,
  readFreshTargetOwnership,
  setActiveDatabaseName,
} from '../activeDatabase';

const mockedStorage = StorageService as jest.Mocked<typeof StorageService>;

describe('active database pointer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the legacy database as the default', () => {
    mockedStorage.getItemSync.mockReturnValue(null);
    expect(getActiveDatabaseName()).toBe(LEGACY_DATABASE_NAME);
  });

  it('reads an activated target pointer', () => {
    mockedStorage.getItemSync.mockReturnValue(TARGET_DATABASE_NAME);
    expect(getActiveDatabaseName()).toBe(TARGET_DATABASE_NAME);
  });

  it('fails closed to the legacy database for an unknown pointer', () => {
    mockedStorage.getItemSync.mockReturnValue('unexpected_database');
    expect(getActiveDatabaseName()).toBe(LEGACY_DATABASE_NAME);
  });

  it('writes the pointer only when the caller activates a verified target', () => {
    setActiveDatabaseName(TARGET_DATABASE_NAME);
    expect(mockedStorage.setItemSync).toHaveBeenCalledWith('active_database_name', TARGET_DATABASE_NAME);
  });

  it('round-trips fresh target ownership through MMKV', () => {
    const ownership = beginFreshTargetOwnership();
    persistFreshTargetOwnership(ownership);
    const write = mockedStorage.setItemSync.mock.calls.find(([key]) => key === 'fresh_target_ownership_v1');
    expect(write?.[1]).toBe(JSON.stringify(ownership));

    mockedStorage.getItemSync.mockImplementation(key =>
      key === 'fresh_target_ownership_v1' ? (write?.[1] ?? null) : null,
    );
    expect(readFreshTargetOwnership()).toEqual(ownership);
  });
});
