import {getActiveDatabaseName, type ActiveDatabaseName} from './activeDatabase';
import {decideDatabasePreflight, type DatabasePreflightDecision, type DatabaseProbeResult} from './preflight';
import {probeDatabaseReadOnly} from './nativePreflight';

export type ReadOnlyProbe = (databaseName: ActiveDatabaseName) => Promise<DatabaseProbeResult>;

/**
 * Composes the active pointer, native read-only probe and fail-closed
 * decision. It is intentionally not called by backend/index.ts until the
 * target writer and recovery UI are ready to handle every decision kind.
 */
export const runDatabasePreflight = async (
  activeDatabase: ActiveDatabaseName = getActiveDatabaseName(),
  probe: ReadOnlyProbe = probeDatabaseReadOnly,
): Promise<DatabasePreflightDecision> => {
  const result = await probe(activeDatabase);
  return decideDatabasePreflight(activeDatabase, result);
};
