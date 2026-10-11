jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

import StorageService from '../../../utils/asyncStorageService';
import {
  LEGACY_DATABASE_NAME,
  TARGET_DATABASE_NAME,
  getActiveDatabaseName,
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

  it('writes the pointer only when the caller activates a verified target', () => {
    setActiveDatabaseName(TARGET_DATABASE_NAME);
    expect(mockedStorage.setItemSync).toHaveBeenCalledWith('active_database_name', TARGET_DATABASE_NAME);
  });
});
