import {NativeModules} from 'react-native';
import {z} from 'zod';
import type {ActiveDatabaseName} from './activeDatabase';
import {fingerprintCopyDataset} from './copyFingerprint';
import {readDatabaseSnapshotReadOnly} from './nativePreflight';
import type {MigrationCheckpoint} from './migrationCheckpoint';
import {decideTargetRecovery, type TargetObservation} from './targetArtifact';

export interface TargetArtifactBridge {
  inspectTargetArtifact: () => Promise<unknown>;
  /** Optional until native marker + closed-adapter deletion is implemented. */
  discardTargetArtifact?: () => Promise<unknown>;
  readSnapshot?: (databaseName: ActiveDatabaseName) => Promise<unknown>;
}

const FileMetadataSchema = z.object({size: z.number().nonnegative(), lastModified: z.number().nonnegative()}).strict();
const NativeArtifactSchema = z.discriminatedUnion('status', [
  z.object({status: z.literal('missing')}).strict(),
  z.object({status: z.literal('orphaned')}).strict(),
  z
    .object({
      status: z.literal('present'),
      database: FileMetadataSchema,
      wal: FileMetadataSchema.nullable(),
      shm: FileMetadataSchema.nullable(),
    })
    .strict(),
]);

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const normalizeTargetArtifact = (value: unknown): z.infer<typeof NativeArtifactSchema> => {
  const parsed = NativeArtifactSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Target artifact bridge returned an invalid result');
  }
  return parsed.data;
};

const statusForCheckpoint = (checkpoint: MigrationCheckpoint): 'fresh' | 'writing' | 'verified' => {
  if (checkpoint.target.status === 'verified' || checkpoint.target.status === 'activated') {
    return 'verified';
  }
  if (checkpoint.target.status === 'writing') {
    return 'writing';
  }
  return 'fresh';
};

/**
 * Combines native file presence, the durable attempt marker, and (for a
 * verified target) a read-only row fingerprint into a recovery observation.
 * A present file without a checkpoint is deliberately treated as unknown.
 */
export const inspectTargetRecovery = async (
  checkpoint: MigrationCheckpoint | null,
  bridge: TargetArtifactBridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge,
): Promise<TargetObservation> => {
  if (!bridge || typeof bridge.inspectTargetArtifact !== 'function') {
    return {kind: 'unknown', reason: 'Target artifact bridge is unavailable'};
  }

  let nativeArtifact: z.infer<typeof NativeArtifactSchema>;
  try {
    nativeArtifact = normalizeTargetArtifact(await bridge.inspectTargetArtifact());
  } catch (error) {
    return {kind: 'unknown', reason: asError(error).message};
  }

  if (nativeArtifact.status === 'missing') {
    return {kind: 'missing'};
  }
  if (nativeArtifact.status === 'orphaned') {
    return {kind: 'unknown', reason: 'Target SQLite sidecar exists without its database file'};
  }
  if (!checkpoint) {
    return {kind: 'unknown', reason: 'Target file exists without a durable migration checkpoint'};
  }

  // A writing target has no content proof that ties the file to this attempt.
  // Never resume or discard it from size/mtime alone; a native marker and
  // closed adapter lifecycle must be added before this branch can proceed.
  if (statusForCheckpoint(checkpoint) !== 'verified') {
    return {kind: 'unknown', reason: 'Writing target ownership marker is unavailable'};
  }

  let fingerprint: string | undefined;
  if (statusForCheckpoint(checkpoint) === 'verified') {
    if (!bridge.readSnapshot) {
      return {kind: 'unknown', reason: 'Target snapshot bridge is unavailable for verified recovery'};
    }
    try {
      const snapshot = await readDatabaseSnapshotReadOnly('watermelon_v4', bridge);
      fingerprint = fingerprintCopyDataset(snapshot);
    } catch (error) {
      return {kind: 'unknown', reason: asError(error).message};
    }
  }

  return {
    kind: 'artifact',
    attemptId: checkpoint.target.attemptId,
    status: statusForCheckpoint(checkpoint),
    ...(fingerprint ? {fingerprint} : {}),
  };
};

export const discardOwnedTargetArtifact = async (
  checkpoint: MigrationCheckpoint,
  observation: TargetObservation,
  bridge: TargetArtifactBridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge,
): Promise<void> => {
  const recovery = decideTargetRecovery(checkpoint, observation);
  if (recovery.kind !== 'discard-owned') {
    throw new Error(
      `Refusing to discard target: ${recovery.kind === 'blocked' ? recovery.reason : 'target is recoverable'}`,
    );
  }
  if (!bridge || typeof bridge.discardTargetArtifact !== 'function') {
    throw new Error('Target artifact discard bridge is unavailable');
  }
  await bridge.discardTargetArtifact();
};
