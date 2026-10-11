import {getActiveDatabaseName, readFreshTargetOwnership, type ActiveDatabaseName} from './activeDatabase';
import {
  decideDatabasePreflight,
  decideDatabasePreflightWithTarget,
  type DatabasePreflightDecision,
  type DatabaseProbeResult,
} from './preflight';
import {probeDatabaseReadOnly, readDatabaseSnapshotReadOnly} from './nativePreflight';
import type {CopyDataset} from './copyVerification';
import {readMigrationCheckpoint} from './migrationCheckpoint';
import {
  inspectTargetRecovery,
  normalizeTargetArtifact,
  verifyFreshTargetOwnership,
  type TargetArtifactBridge,
} from './targetArtifactBridge';
import {decideTargetRecovery, type TargetObservation} from './targetArtifact';
import {COPY_TABLES} from './copyVerification';
import {detectLegacyDatabaseSource} from './legacySchema';
import {NativeModules} from 'react-native';

export type ReadOnlyProbe = (databaseName: ActiveDatabaseName) => Promise<DatabaseProbeResult>;
export type ReadOnlySnapshot = (databaseName: ActiveDatabaseName) => Promise<CopyDataset>;

export type TargetRecoveryInspection = () => Promise<TargetObservation>;
export type FreshTargetInspection = () => Promise<unknown>;

const inspectOwnedTarget = async (): Promise<TargetObservation> => {
  const checkpoint = readMigrationCheckpoint();
  return inspectTargetRecovery(checkpoint.kind === 'valid' ? checkpoint.checkpoint : null);
};

const inspectFreshTargetArtifact = async (): Promise<unknown> => {
  const bridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge;
  if (!bridge || typeof bridge.inspectTargetArtifact !== 'function') {
    throw new Error('Fresh target artifact bridge is unavailable');
  }
  return bridge.inspectTargetArtifact();
};

const isOwnedFreshTarget = async (
  targetProbe: DatabaseProbeResult,
  readSnapshot: ReadOnlySnapshot,
  inspectFreshTarget: FreshTargetInspection,
): Promise<boolean> => {
  const ownership = readFreshTargetOwnership();
  if (!ownership) return false;

  try {
    const artifact = normalizeTargetArtifact(await inspectFreshTarget());
    const marker = artifact.status === 'present' || artifact.status === 'orphaned' ? artifact.marker : undefined;
    if (
      !marker ||
      marker.attemptId !== ownership.attemptId ||
      marker.generation !== ownership.generation ||
      marker.sourceFingerprint !== ownership.sourceFingerprint ||
      marker.targetFingerprint !== ownership.targetFingerprint ||
      !['writing', 'verified', 'activated'].includes(marker.status)
    ) {
      return false;
    }
    if (targetProbe.kind === 'missing') {
      return artifact.status === 'orphaned';
    }
    if (artifact.status !== 'present') return false;
    if (targetProbe.kind !== 'metadata' || targetProbe.integrity !== 'ok') return false;
    if (detectLegacyDatabaseSource(targetProbe.snapshot) !== 'target-v4') return false;
    const snapshot = await readSnapshot('watermelon_v4');
    return COPY_TABLES.every(table => (snapshot[table] ?? []).length === 0);
  } catch {
    return false;
  }
};

/**
 * Composes the active pointer, native read-only probe and fail-closed
 * decision. It is intentionally not called by backend/index.ts until the
 * target writer and recovery UI are ready to handle every decision kind.
 */
export const runDatabasePreflight = async (
  activeDatabase: ActiveDatabaseName = getActiveDatabaseName(),
  probe: ReadOnlyProbe = probeDatabaseReadOnly,
  readSnapshot: ReadOnlySnapshot = databaseName => readDatabaseSnapshotReadOnly(databaseName),
  inspectTarget: TargetRecoveryInspection = inspectOwnedTarget,
  inspectFreshTarget: FreshTargetInspection = inspectFreshTargetArtifact,
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
    if (await isOwnedFreshTarget(target, readSnapshot, inspectFreshTarget)) {
      return {kind: 'fresh-target', databaseName: 'watermelon_v4'};
    }
    return decideDatabasePreflightWithTarget(activeDatabase, result, target);
  }
  return decideDatabasePreflight(activeDatabase, result);
};
