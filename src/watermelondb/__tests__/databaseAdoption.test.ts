import type {Database} from '@nozbe/watermelondb';
import {adoptDatabaseInstance, getDatabase, resetDatabaseInstance, waitForDatabase} from '../database';

describe('verified target database adoption', () => {
  afterEach(() => resetDatabaseInstance());

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
});
