import {normalizeNativeProbeResult, probeDatabaseReadOnly, type ReadOnlySqliteBridge} from '../nativePreflight';
import type {ActiveDatabaseName} from '../activeDatabase';

describe('normalizeNativeProbeResult', () => {
  it('preserves a missing file result', () => {
    expect(normalizeNativeProbeResult({status: 'missing'})).toEqual({kind: 'missing'});
  });

  it('normalizes valid metadata without accepting native-only fields', () => {
    expect(
      normalizeNativeProbeResult({
        status: 'ready',
        version: 3,
        tables: {users: ['username', 'email']},
        indexes: {users: ['users_user_id']},
        integrity: 'ok',
        filePath: '/private/user-data/watermelon.db',
      }),
    ).toEqual({
      kind: 'metadata',
      snapshot: {
        version: 3,
        tables: {users: ['username', 'email']},
        indexes: {users: ['users_user_id']},
      },
      integrity: 'ok',
    });
  });

  it('fails closed for malformed or unsafe output', () => {
    expect(
      normalizeNativeProbeResult({status: 'ready', version: 3, tables: {}, indexes: {}, integrity: 'unknown'}),
    ).toEqual({
      kind: 'error',
      error: expect.any(Error),
    });
    expect(normalizeNativeProbeResult({status: 'ready', version: 5, tables: [], indexes: {}})).toEqual({
      kind: 'error',
      error: expect.any(Error),
    });
  });
});

describe('probeDatabaseReadOnly', () => {
  it('does not fall back to a writable Watermelon adapter when the bridge is absent', async () => {
    const result = await probeDatabaseReadOnly('watermelon', undefined);
    expect(result).toEqual({kind: 'error', error: expect.any(Error)});
  });

  it('passes the fixed database name to the native bridge', async () => {
    const probe = jest.fn(async (databaseName: ActiveDatabaseName) => ({status: 'missing', databaseName}));
    const bridge: ReadOnlySqliteBridge = {probe};
    await expect(probeDatabaseReadOnly('watermelon', bridge)).resolves.toEqual({kind: 'missing'});
    expect(probe).toHaveBeenCalledWith('watermelon');
  });

  it('converts native failures into a blocking probe result', async () => {
    const bridge: ReadOnlySqliteBridge = {
      probe: async () => {
        throw new Error('database is locked');
      },
    };
    await expect(probeDatabaseReadOnly('watermelon', bridge)).resolves.toEqual({
      kind: 'error',
      error: new Error('database is locked'),
    });
  });

  it('rejects database names outside the fixed active-database allow-list', async () => {
    await expect(
      probeDatabaseReadOnly('watermelon/../../other' as unknown as ActiveDatabaseName, {probe: jest.fn()}),
    ).resolves.toEqual({
      kind: 'error',
      error: expect.any(Error),
    });
  });
});
