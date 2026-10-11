import {z} from 'zod';
import StorageService from '../../utils/asyncStorageService';

export const MIGRATION_CHECKPOINT_KEY = 'dual_database_upgrade_checkpoint_v1';
export const TARGET_DATABASE_NAME = 'watermelon_v4' as const;

export const UPGRADE_STATES = ['pending', 'copying', 'verified', 'activated', 'failed'] as const;
export type UpgradeState = (typeof UPGRADE_STATES)[number];
export type UpgradeSource = 'zero-v3' | 'zerox-v3';

const CheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    generation: z.number().int().positive(),
    state: z.enum(UPGRADE_STATES),
    source: z.enum(['zero-v3', 'zerox-v3']),
    sourceFingerprint: z
      .string()
      .min(1)
      .max(512)
      .refine(value => value.trim().length > 0, 'Source fingerprints cannot be blank'),
    backup: z
      .object({
        status: z.enum(['pending', 'ready']),
        descriptor: z
          .string()
          .min(1)
          .max(512)
          .refine(value => value.trim().length > 0, 'Backup descriptors cannot be blank')
          .optional(),
      })
      .strict(),
    target: z
      .object({
        databaseName: z.literal(TARGET_DATABASE_NAME),
        attemptId: z
          .string()
          .min(1)
          .max(768)
          .refine(value => value.trim().length > 0, 'Attempt ids cannot be blank'),
        status: z.enum(['missing', 'fresh', 'writing', 'verified', 'activated']),
        fingerprint: z
          .string()
          .min(1)
          .max(512)
          .refine(value => value.trim().length > 0, 'Target fingerprints cannot be blank')
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (checkpoint.backup.status === 'ready' && checkpoint.backup.descriptor === undefined) {
      context.addIssue({code: 'custom', path: ['backup', 'descriptor'], message: 'Ready backups need a descriptor'});
    }
    if (
      (checkpoint.target.status === 'verified' || checkpoint.target.status === 'activated') &&
      checkpoint.target.fingerprint === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['target', 'fingerprint'],
        message: 'Verified targets need a fingerprint',
      });
    }
  });

export type MigrationCheckpoint = z.infer<typeof CheckpointSchema>;

export type MigrationCheckpointRead =
  {kind: 'missing'} | {kind: 'valid'; checkpoint: MigrationCheckpoint} | {kind: 'invalid'; error: Error};

const parseCheckpoint = (raw: string): MigrationCheckpointRead => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {kind: 'invalid', error: new Error('Migration checkpoint is not valid JSON')};
  }

  const parsed = CheckpointSchema.safeParse(value);
  return parsed.success
    ? {kind: 'valid', checkpoint: parsed.data}
    : {kind: 'invalid', error: new Error('Migration checkpoint has an unsupported shape')};
};

export const readMigrationCheckpoint = (): MigrationCheckpointRead => {
  const raw = StorageService.getItemSync(MIGRATION_CHECKPOINT_KEY);
  return raw === null ? {kind: 'missing'} : parseCheckpoint(raw);
};

const assertCheckpoint = (checkpoint: MigrationCheckpoint): void => {
  const parsed = CheckpointSchema.safeParse(checkpoint);
  if (!parsed.success) {
    throw new Error('Refusing to persist an invalid migration checkpoint');
  }
};

export const persistMigrationCheckpoint = (checkpoint: MigrationCheckpoint): void => {
  assertCheckpoint(checkpoint);
  // A complete JSON replacement prevents readers from observing a partially
  // updated state object. MMKV's single-key write is the durable boundary.
  StorageService.setItemSync(MIGRATION_CHECKPOINT_KEY, JSON.stringify(checkpoint));
};

export const clearMigrationCheckpoint = (): void => {
  StorageService.removeItemSync(MIGRATION_CHECKPOINT_KEY);
};

export interface BeginMigrationCheckpointInput {
  source: UpgradeSource;
  sourceFingerprint: string;
}

/** Starts a new generation; a corrupt prior marker blocks rather than resets. */
export const beginMigrationCheckpoint = ({
  source,
  sourceFingerprint,
}: BeginMigrationCheckpointInput): MigrationCheckpoint => {
  const normalizedFingerprint = sourceFingerprint.trim();
  if (normalizedFingerprint.length === 0) {
    throw new Error('A source fingerprint is required before copying');
  }

  const previous = readMigrationCheckpoint();
  if (previous.kind === 'invalid') {
    throw previous.error;
  }

  const generation = previous.kind === 'valid' ? previous.checkpoint.generation + 1 : 1;
  const attemptId = `${generation}:${normalizedFingerprint}`;
  const checkpoint: MigrationCheckpoint = {
    schemaVersion: 1,
    generation,
    state: 'pending',
    source,
    sourceFingerprint: normalizedFingerprint,
    backup: {status: 'pending'},
    target: {databaseName: TARGET_DATABASE_NAME, attemptId, status: 'missing'},
  };
  persistMigrationCheckpoint(checkpoint);
  return checkpoint;
};

export const updateMigrationCheckpoint = (
  checkpoint: MigrationCheckpoint,
  update: (current: MigrationCheckpoint) => MigrationCheckpoint,
): MigrationCheckpoint => {
  const next = update(checkpoint);
  if (next.generation !== checkpoint.generation || next.target.attemptId !== checkpoint.target.attemptId) {
    throw new Error('Migration checkpoint generation and attempt identity are immutable');
  }
  persistMigrationCheckpoint(next);
  return next;
};

export const assertSourceFingerprint = (
  checkpoint: MigrationCheckpoint,
  source: UpgradeSource,
  sourceFingerprint: string,
): void => {
  if (checkpoint.source !== source || checkpoint.sourceFingerprint !== sourceFingerprint) {
    throw new Error('Migration source changed while the upgrade was in progress');
  }
};
