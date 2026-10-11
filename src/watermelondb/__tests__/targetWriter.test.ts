import {createWatermelonTargetTransaction} from '../targetWriter';
import type {CopyDataset} from '../../backend/migrations/copyVerification';

const makeDatabase = (rows: CopyDataset, events: string[]) => ({
  write: jest.fn(
    async (work: (writer: {batch: (records: ReadonlyArray<unknown>) => Promise<void>}) => Promise<unknown>) => {
      events.push('begin');
      await work({
        batch: async records => {
          events.push(`batch:${records.length}`);
        },
      });
      events.push('commit');
    },
  ),
  get: jest.fn((table: string) => ({
    prepareCreateFromDirtyRaw: (raw: Record<string, unknown>) => ({table, raw}),
    query: () => ({unsafeFetchRaw: async () => rows[table as keyof CopyDataset] ?? []}),
  })),
});

const emptyTarget: CopyDataset = {
  users: [],
  categories: [],
  expenses: [],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
};

describe('createWatermelonTargetTransaction', () => {
  it('writes one batch and verifies the read-back target', async () => {
    const events: string[] = [];
    const database = makeDatabase(emptyTarget, events);
    const discardTarget = jest.fn(async () => undefined);
    const verify = jest.fn(() => ({ok: true}) as never);
    const transaction = createWatermelonTargetTransaction(database, discardTarget);

    await expect(transaction(emptyTarget, verify)).resolves.toEqual({ok: true});
    expect(events).toEqual(['begin', 'commit']);
    expect(verify).toHaveBeenCalledWith(emptyTarget);
    expect(discardTarget).not.toHaveBeenCalled();
  });

  it('discards the inactive target when the writer or verifier fails', async () => {
    const events: string[] = [];
    const database = makeDatabase(emptyTarget, events);
    const discardTarget = jest.fn(async () => undefined);
    const transaction = createWatermelonTargetTransaction(database, discardTarget);
    const verify = jest.fn(() => {
      throw new Error('read-back mismatch');
    });

    await expect(transaction(emptyTarget, verify)).rejects.toThrow('read-back mismatch');
    expect(discardTarget).toHaveBeenCalledTimes(1);
  });
});
