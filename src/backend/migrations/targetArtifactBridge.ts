import {NativeModules} from 'react-native';
import {z} from 'zod';
import type {ActiveDatabaseName, FreshTargetOwnership} from './activeDatabase';
import {fingerprintCopyDataset} from './copyFingerprint';
import {probeDatabaseReadOnly, readDatabaseSnapshotReadOnly, type ReadOnlySqliteBridge} from './nativePreflight';
import type {MigrationCheckpoint} from './migrationCheckpoint';
import {decideTargetRecovery, type TargetObservation} from './targetArtifact';
import {detectLegacyDatabaseSource} from './legacySchema';

export interface TargetArtifactBridge {
  inspectTargetArtifact: () => Promise<unknown>;
  /** Optional until native marker + closed-adapter deletion is implemented. */
  discardTargetArtifact?: (attemptId: string, generation: number, sourceFingerprint: string) => Promise<unknown>;
  claimTargetArtifact?: (attemptId: string, generation: number, sourceFingerprint: string) => Promise<unknown>;
  claimFreshTargetArtifact?: (
    attemptId: string,
    generation: number,
    sourceFingerprint: string,
    targetFingerprint: string,
  ) => Promise<unknown>;
  updateTargetArtifactMarker?: (
    attemptId: string,
    status: 'writing' | 'verified' | 'activated',
    targetFingerprint?: string,
  ) => Promise<unknown>;
  probe?: (databaseName: ActiveDatabaseName) => Promise<unknown>;
  readSnapshot?: (databaseName: ActiveDatabaseName) => Promise<unknown>;
}

const FileMetadataSchema = z.object({size: z.number().nonnegative(), lastModified: z.number().nonnegative()}).strict();
const MarkerSchema = z
  .object({
    attemptId: z.string().min(1),
    generation: z.number().int().positive(),
    sourceFingerprint: z.string().min(1),
    status: z.enum(['writing', 'verified', 'activated']),
    targetFingerprint: z.string().min(1).optional(),
  })
  .strict();
const NativeArtifactSchema = z.discriminatedUnion('status', [
  z.object({status: z.literal('missing')}).strict(),
  z.object({status: z.literal('orphaned'), marker: MarkerSchema.optional()}).strict(),
  z.object({status: z.literal('invalid-marker')}).strict(),
  z
    .object({
      status: z.literal('present'),
      database: FileMetadataSchema,
      wal: FileMetadataSchema.nullable(),
      shm: FileMetadataSchema.nullable(),
      marker: MarkerSchema.nullable(),
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

export const verifyFreshTargetOwnership = async (
  ownership: FreshTargetOwnership,
  bridge: TargetArtifactBridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge,
): Promise<boolean> => {
  if (!bridge || typeof bridge.inspectTargetArtifact !== 'function') return false;
  try {
    const artifact = normalizeTargetArtifact(await bridge.inspectTargetArtifact());
    return (
      artifact.status === 'present' &&
      artifact.marker?.status === 'activated' &&
      artifact.marker.attemptId === ownership.attemptId &&
      artifact.marker.generation === ownership.generation &&
      artifact.marker.sourceFingerprint === ownership.sourceFingerprint &&
      artifact.marker.targetFingerprint === ownership.targetFingerprint
    );
  } catch {
    return false;
  }
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
    const marker = nativeArtifact.marker;
    if (
      checkpoint &&
      marker &&
      checkpoint.target.status === 'writing' &&
      marker.status === 'writing' &&
      marker.attemptId === checkpoint.target.attemptId &&
      marker.generation === checkpoint.generation &&
      marker.sourceFingerprint === checkpoint.sourceFingerprint
    ) {
      return {kind: 'artifact', attemptId: checkpoint.target.attemptId, status: 'writing'};
    }
    return {kind: 'unknown', reason: 'Target SQLite sidecar exists without its database file'};
  }
  if (nativeArtifact.status === 'invalid-marker') {
    return {kind: 'unknown', reason: 'Target artifact marker is invalid'};
  }
  if (!checkpoint) {
    return {kind: 'unknown', reason: 'Target file exists without a durable migration checkpoint'};
  }

  if (
    !nativeArtifact.marker ||
    nativeArtifact.marker.attemptId !== checkpoint.target.attemptId ||
    nativeArtifact.marker.generation !== checkpoint.generation ||
    nativeArtifact.marker.sourceFingerprint !== checkpoint.sourceFingerprint
  ) {
    return {kind: 'unknown', reason: 'Target artifact marker belongs to another attempt'};
  }

  const expectedStatus = statusForCheckpoint(checkpoint);
  const markerStatusMatches =
    expectedStatus === 'verified'
      ? nativeArtifact.marker.status === 'verified' || nativeArtifact.marker.status === 'activated'
      : expectedStatus === 'fresh'
        ? nativeArtifact.marker.status === 'writing'
        : nativeArtifact.marker.status === expectedStatus;
  if (!markerStatusMatches) {
    return {kind: 'unknown', reason: 'Target artifact marker status does not match the checkpoint'};
  }

  // A writing target is never resumed. Once the native marker identity has
  // matched the durable checkpoint, the caller may discard it through the
  // identity-guarded native API and rebuild from the immutable source backup.
  // Size/mtime alone never establishes ownership.
  if (expectedStatus !== 'verified') {
    return {
      kind: 'artifact',
      attemptId: checkpoint.target.attemptId,
      status: 'writing',
    };
  }

  if (typeof bridge.probe !== 'function') {
    return {kind: 'unknown', reason: 'Target schema probe is unavailable for verified recovery'};
  }
  const targetProbe = await probeDatabaseReadOnly('watermelon_v4', {
    probe: bridge.probe,
    readSnapshot: bridge.readSnapshot,
  } satisfies ReadOnlySqliteBridge);
  if (targetProbe.kind === 'error') {
    return {kind: 'unknown', reason: targetProbe.error.message};
  }
  if (targetProbe.kind !== 'metadata' || targetProbe.integrity !== 'ok') {
    return {kind: 'unknown', reason: 'Target schema or SQLite integrity is not verified'};
  }
  if (detectLegacyDatabaseSource(targetProbe.snapshot) !== 'target-v4') {
    return {kind: 'unknown', reason: 'Target database is not the exact v4 schema'};
  }

  let fingerprint: string | undefined;
  if (expectedStatus === 'verified') {
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
    status: expectedStatus,
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
  await bridge.discardTargetArtifact(checkpoint.target.attemptId, checkpoint.generation, checkpoint.sourceFingerprint);
};

export const claimTargetArtifact = async (
  checkpoint: MigrationCheckpoint,
  bridge: TargetArtifactBridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge,
): Promise<void> => {
  if (!bridge || typeof bridge.claimTargetArtifact !== 'function') {
    throw new Error('Target artifact claim bridge is unavailable');
  }
  await bridge.claimTargetArtifact(checkpoint.target.attemptId, checkpoint.generation, checkpoint.sourceFingerprint);
};

export const updateTargetArtifactMarker = async (
  attemptId: string,
  status: 'writing' | 'verified' | 'activated',
  targetFingerprint: string | undefined,
  bridge: TargetArtifactBridge = NativeModules.ZeroReadOnlySqlite as TargetArtifactBridge,
): Promise<void> => {
  if (!bridge || typeof bridge.updateTargetArtifactMarker !== 'function') {
    throw new Error('Target artifact marker update bridge is unavailable');
  }
  await bridge.updateTargetArtifactMarker(attemptId, status, targetFingerprint);
};
