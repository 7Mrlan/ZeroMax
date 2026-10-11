import {resetMigrationFailureForRetry, runMigrations} from './migrations/runner';
import {appendErrorLog} from '../utils/errorLog';
import {resetDatabaseInstance, waitForDatabase} from '../watermelondb/database';

/**
 * Initialize the backend layer.
 * Called once on app startup before any screens render.
 *
 * Responsibilities:
 * - Run pending data migrations (sequential, versioned, idempotent)
 * - Future: cache warmup, integrity checks, etc.
 */
export type BackendInitResult =
  {ok: true} | {ok: false; kind: 'migration' | 'database'; retryable: boolean; error: Error};

let initializationPromise: Promise<BackendInitResult> | null = null;

const performInitialization = async (): Promise<BackendInitResult> => {
  try {
    // SQLite schema setup must finish before data migrations hydrate models.
    await waitForDatabase();
    const migrationResult = await runMigrations();
    if (!migrationResult.ok) {
      const error = migrationResult.error ?? new Error('Data migration failed');
      return {ok: false, kind: 'migration', retryable: true, error};
    }
    return {ok: true};
  } catch (error) {
    const initError = error instanceof Error ? error : new Error(String(error));
    appendErrorLog(initError, true);
    return {ok: false, kind: 'database', retryable: true, error: initError};
  }
};

/** Single-flight startup; duplicate roots cannot run database writers twice. */
export const initBackend = (): Promise<BackendInitResult> => {
  initializationPromise ??= performInitialization();
  return initializationPromise;
};

/** Starts a fresh attempt after the boot recovery surface requests a retry. */
export const retryBackend = (): Promise<BackendInitResult> => {
  initializationPromise = null;
  resetMigrationFailureForRetry();
  resetDatabaseInstance();
  return initBackend();
};
