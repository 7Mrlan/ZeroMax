import {runBootGate, type BootGateDependencies} from '../bootGate';

const makeDependencies = (overrides: Partial<BootGateDependencies<string>> = {}): BootGateDependencies<string> => ({
  preflight: async () => ({kind: 'open-target', databaseName: 'watermelon_v4'}),
  createFreshTarget: async () => 'fresh-db',
  migrateLegacy: async () => 'migrated-db',
  adoptDatabase: async () => undefined,
  openActiveDatabase: async () => undefined,
  ...overrides,
});

describe('runBootGate', () => {
  it('preflights before opening the active database', async () => {
    const order: string[] = [];
    const result = await runBootGate(
      makeDependencies({
        preflight: async () => {
          order.push('preflight');
          return {kind: 'open-target', databaseName: 'watermelon_v4'};
        },
        openActiveDatabase: async () => {
          order.push('open');
        },
      }),
    );
    expect(result).toEqual({ok: true, kind: 'open-target'});
    expect(order).toEqual(['preflight', 'open']);
  });

  it('adopts a fresh target without opening a legacy adapter', async () => {
    const open = jest.fn(async () => undefined);
    const adopt = jest.fn(async () => undefined);
    const result = await runBootGate(
      makeDependencies({
        preflight: async () => ({kind: 'fresh-target', databaseName: 'watermelon_v4'}),
        adoptDatabase: adopt,
        openActiveDatabase: open,
      }),
    );
    expect(result).toEqual({ok: true, kind: 'fresh-target'});
    expect(adopt).toHaveBeenCalledWith('fresh-db');
    expect(open).not.toHaveBeenCalled();
  });

  it('requires the injected legacy coordinator for copy-legacy', async () => {
    const migrate = jest.fn(async () => 'migrated-db');
    const result = await runBootGate(
      makeDependencies({
        preflight: async () => ({kind: 'copy-legacy', source: 'zerox-v3'}),
        migrateLegacy: migrate,
      }),
    );
    expect(result).toEqual({ok: true, kind: 'migrated-legacy'});
    expect(migrate).toHaveBeenCalledWith('zerox-v3');
  });

  it('never opens or creates an adapter for blocked preflight', async () => {
    const create = jest.fn(async () => 'fresh-db');
    const open = jest.fn(async () => undefined);
    const result = await runBootGate(
      makeDependencies({
        preflight: async () => ({kind: 'blocked', reason: 'unknown schema'}),
        createFreshTarget: create,
        openActiveDatabase: open,
      }),
    );
    expect(result).toEqual({ok: false, reason: 'unknown schema'});
    expect(create).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
