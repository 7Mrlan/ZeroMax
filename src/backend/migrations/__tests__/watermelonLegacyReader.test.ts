jest.mock('@nozbe/watermelondb/adapters/sqlite', () => ({
  __esModule: true,
  default: class FakeSQLiteAdapter {
    dbName: string;
    schema: unknown;
    initializingPromise = Promise.resolve();

    constructor(options: {dbName: string; schema: unknown}) {
      this.dbName = options.dbName;
      this.schema = options.schema;
    }

    unsafeQueryRaw(_query: unknown, callback: (result: unknown) => void) {
      callback({value: [{name: 'id'}]});
    }
  },
}));

import {createWatermelonLegacyReader} from '../watermelonLegacyReader';

describe('createWatermelonLegacyReader', () => {
  it('creates a read-only union-schema adapter and serializes raw metadata queries', async () => {
    const reader = createWatermelonLegacyReader('watermelon');
    expect(reader.adapter.dbName).toBe('watermelon');
    expect(reader.adapter.schema.version).toBe(3);

    await expect(reader.queryRaw('PRAGMA user_version;')).resolves.toEqual([{name: 'id'}]);
    await expect(reader.queryRaw('SELECT * FROM expenses;')).rejects.toThrow('only allows schema metadata');
    await expect(reader.queryRaw('PRAGMA journal_mode;')).rejects.toThrow('only allows schema metadata');
    expect(() => createWatermelonLegacyReader('other_database')).toThrow('restricted to the legacy database');
  });
});
