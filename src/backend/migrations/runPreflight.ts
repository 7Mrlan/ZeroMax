import {getActiveDatabaseName, type ActiveDatabaseName} from './activeDatabase';
import {
  decideDatabasePreflight,
  decideDatabasePreflightWithTarget,
  type DatabasePreflightDecision,
  type DatabaseProbeResult,
} from './preflight';
import {probeDatabaseReadOnly, readDatabaseSnapshotReadOnly} from './nativePreflight';
import type {CopyDataset} from './copyVerification';
import {readMigrationCheckpoint} from './migrationCheckpoint';
import {inspectTargetRecovery} from './targetArtifactBridge';
import {verifyFreshTargetOwnership} from './targetArtifactBridge';
import {decideTargetRecovery, type TargetObservation} from './targetArtifact';
import {readFreshTargetOwnership} from './activeDatabase';

export type ReadOnlyProbe = (databaseName: ActiveDatabaseName) => Promise<DatabaseProbeResult>;
export type ReadOnlySnapshot = (databaseName: ActiveDatabaseName) => Promise<CopyDataset>;

export type TargetRecoveryInspection = () => Promise<TargetObservation>;

const inspectOwnedTarget = async (): Promise<TargetObservation> => {
  const checkpoint = readMigrationCheckpoint();
  return inspectTargetRecovery(checkpoint.kind === 'valid' ? checkpoint.checkpoint : null);
};

/**
 * Composes the active pointer, native read-only probe and fail-closed
 * decision. It is intentionally not called by backend/index.ts until the
 * target writer and recovery UI are ready to handle every decision kind.
 */
export const runDatabasePreflight = async (
  activeDatabase: ActiveDatabaseName = getActiveDatabaseName(),
  probe: ReadOnlyProbe = probeDatabaseReadOnly,
  _readSnapshot: ReadOnlySnapshot = databaseName => readDatabaseSnapshotReadOnly(databaseName),
  inspectTarget: TargetRecoveryInspection = inspectOwnedTarget,
): Promise<DatabasePreflightDecision> => {
  const result = await probe(activeDatabase);
  if (activeDatabase === 'watermelon_v4') {
    const decision = decideDatabasePreflight(activeDatabase, result);
    if (decision.kind !== 'open-target') {
      return decision;
    }
    const checkpoint = readMigrationCheckpoint();
    if (checkpoint.kind !== 'valid') {
      const ownership = readFreshTargetOwnership();
      if (!ownership || !(await verifyFreshTargetOwnership(ownership))) {
        return {kind: 'blocked', reason: 'The active target has no valid durable ownership evidence'};
      }
      return decision;
    }
    try {
      const observation = await inspectTarget();
      if (decideTargetRecovery(checkpoint.checkpoint, observation).kind !== 'open-verified') {
        return {kind: 'blocked', reason: 'The active target artifact is not owned and verified'};
      }
    } catch (error) {
      return {
        kind: 'blocked',
        reason: 'The active target artifact could not be verified',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    return decision;
  }
  if (activeDatabase === 'watermelon' && result.kind === 'missing') {
    const target = await probe('watermelon_v4');
    return decideDatabasePreflightWithTarget(activeDatabase, result, target);
  }
  return decideDatabasePreflight(activeDatabase, result);
};
