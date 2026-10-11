import type {Database} from '@nozbe/watermelondb';
import {adoptDatabaseInstance, getDatabase, resetDatabaseInstance, waitForDatabase} from '../database';

describe('verified target database adoption', () => {
  afterEach(() => resetDatabaseInstance({force: true}));

  it('adopts the already initialized target instead of constructing another adapter', async () => {
    const verified = {} as Database;
    adoptDatabaseInstance(verified);
    await expect(waitForDatabase()).resolves.toBeUndefined();
    expect(getDatabase()).toBe(verified);
  });

  it('refuses adoption after the production singleton already exists', () => {
    const verified = {} as Database;
    adoptDatabaseInstance(verified);
    expect(() => adoptDatabaseInstance({} as Database)).toThrow('production singleton');
  });

  it('keeps the adopted instance during a retry so no second JSI adapter is created', () => {
    const verified = {} as Database;
    adoptDatabaseInstance(verified);

    resetDatabaseInstance();

    expect(getDatabase()).toBe(verified);
  });
});
