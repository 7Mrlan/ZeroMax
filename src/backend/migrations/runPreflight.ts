import {getActiveDatabaseName, type ActiveDatabaseName} from './activeDatabase';
import {
  decideDatabasePreflight,
  decideDatabasePreflightWithTarget,
  type DatabasePreflightDecision,
  type DatabaseProbeResult,
} from './preflight';
import {probeDatabaseReadOnly, readDatabaseSnapshotReadOnly} from './nativePreflight';
import {COPY_TABLES, type CopyDataset} from './copyVerification';
import {detectLegacyDatabaseSource} from './legacySchema';

export type ReadOnlyProbe = (databaseName: ActiveDatabaseName) => Promise<DatabaseProbeResult>;
export type ReadOnlySnapshot = (databaseName: ActiveDatabaseName) => Promise<CopyDataset>;

const isEmptyTargetSnapshot = (snapshot: CopyDataset): boolean =>
  COPY_TABLES.every(table => Array.isArray(snapshot[table]) && snapshot[table]?.length === 0);

/**
 * Composes the active pointer, native read-only probe and fail-closed
 * decision. It is intentionally not called by backend/index.ts until the
 * target writer and recovery UI are ready to handle every decision kind.
 */
export const runDatabasePreflight = async (
  activeDatabase: ActiveDatabaseName = getActiveDatabaseName(),
  probe: ReadOnlyProbe = probeDatabaseReadOnly,
  readSnapshot: ReadOnlySnapshot = databaseName => readDatabaseSnapshotReadOnly(databaseName),
): Promise<DatabasePreflightDecision> => {
  const result = await probe(activeDatabase);
  if (activeDatabase === 'watermelon' && result.kind === 'missing') {
    const target = await probe('watermelon_v4');
    if (
      target.kind === 'metadata' &&
      target.integrity === 'ok' &&
      detectLegacyDatabaseSource(target.snapshot) === 'target-v4'
    ) {
      try {
        // A crash after creating an empty fresh v4 target but before pointer
        // activation is safe to resume. A non-empty target still needs a
        // durable migration checkpoint and remains fail-closed.
        if (isEmptyTargetSnapshot(await readSnapshot('watermelon_v4'))) {
          return {kind: 'fresh-target', databaseName: 'watermelon_v4'};
        }
      } catch {
        // Missing/invalid snapshot evidence falls through to the blocked
        // decision below; never infer emptiness from metadata alone.
      }
    }
    return decideDatabasePreflightWithTarget(activeDatabase, result, target);
  }
  return decideDatabasePreflight(activeDatabase, result);
};
