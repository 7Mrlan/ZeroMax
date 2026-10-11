import {inspectLegacySqliteSchema, type LegacySqlReader} from '../legacyInspection';

const makeReader = (responses: Record<string, ReadonlyArray<Record<string, unknown>>>): LegacySqlReader => ({
  initializingPromise: Promise.resolve(),
  queryRaw: jest.fn(async (sql: string) => responses[sql] ?? []),
});

describe('inspectLegacySqliteSchema', () => {
  it('reads user_version and only discovers existing tables', async () => {
    const reader = makeReader({
      'PRAGMA user_version;': [{user_version: 3}],
      'PRAGMA table_info("categories");': [{name: 'name'}, {name: 'parent_id'}],
      'PRAGMA table_info("expenses");': [{name: 'title'}, {name: 'amount'}],
    });

    await expect(inspectLegacySqliteSchema(reader)).resolves.toEqual({
      version: 3,
      tables: {
        categories: ['name', 'parent_id'],
        expenses: ['title', 'amount'],
      },
    });
  });

  it('waits for adapter initialization before issuing metadata queries', async () => {
    let ready = false;
    let resolveReady!: () => void;
    const initializingPromise = new Promise<void>(resolve => {
      resolveReady = () => {
        ready = true;
        resolve();
      };
    });
    const reader: LegacySqlReader = {
      initializingPromise,
      queryRaw: jest.fn(async sql => {
        expect(ready).toBe(true);
        return sql === 'PRAGMA user_version;' ? [{user_version: 3}] : [];
      }),
    };

    const inspection = inspectLegacySqliteSchema(reader);
    resolveReady();
    await expect(inspection).resolves.toEqual({version: 3, tables: {}});
  });

  it('fails instead of treating a reader error as an empty database', async () => {
    const reader: LegacySqlReader = {
      initializingPromise: Promise.resolve(),
      queryRaw: jest.fn(async () => {
        throw new Error('sqlite unavailable');
      }),
    };
    await expect(inspectLegacySqliteSchema(reader)).rejects.toThrow('sqlite unavailable');
  });
});
