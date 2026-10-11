import {
  verifyCopiedRows,
  type CopyDataset,
  type CopyRow,
  type CopyTable,
  type CopyVerificationReport,
} from './copyVerification';
import {normalizeLegacyRows, type CopyNormalizationResult} from './copyNormalization';
import type {LegacyDatabaseSource} from './legacySchema';

const COPY_WRITE_ORDER: ReadonlyArray<CopyTable> = [
  'users',
  'categories',
  'currencies',
  'debtors',
  'expenses',
  'incomes',
  'debts',
  'budgets',
];

/**
 * Native/Watermelon adapter boundary for a copy-on-write migration. The
 * source snapshot must be read in one consistent native transaction; the
 * target writer must be a fresh v4 database and expose rollback semantics.
 */
export interface LegacyCopyDriver {
  readSourceSnapshot: () => Promise<CopyDataset>;
  ensureBackup: () => Promise<void>;
  prepareTarget: () => Promise<void>;
  beginTargetTransaction: () => Promise<void>;
  writeTargetRows: (table: CopyTable, rows: ReadonlyArray<CopyRow>) => Promise<void>;
  readTargetSnapshot: () => Promise<CopyDataset>;
  commitTargetTransaction: () => Promise<void>;
  rollbackTargetTransaction: () => Promise<void>;
}

export interface LegacyCopyResult {
  source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>;
  normalization: CopyNormalizationResult;
  verification: CopyVerificationReport;
}

const copyError = (report: CopyVerificationReport): Error =>
  new Error(`Target copy verification failed: ${report.errors.join('; ') || 'unknown mismatch'}`);

/**
 * Copies one known legacy shape into an isolated target. No active pointer is
 * changed here; activation remains a separate state-machine transition after
 * this function returns a complete verification report.
 */
export const copyLegacyRows = async (
  source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>,
  driver: LegacyCopyDriver,
): Promise<LegacyCopyResult> => {
  await driver.ensureBackup();
  const sourceRows = await driver.readSourceSnapshot();
  const normalization = normalizeLegacyRows(source, sourceRows);
  await driver.prepareTarget();

  let transactionStarted = false;
  try {
    await driver.beginTargetTransaction();
    transactionStarted = true;
    for (const table of COPY_WRITE_ORDER) {
      await driver.writeTargetRows(table, normalization.dataset[table] ?? []);
    }

    const actualTarget = await driver.readTargetSnapshot();
    const verification = verifyCopiedRows({
      source: sourceRows,
      expectedTarget: normalization.dataset,
      actualTarget,
    });
    if (!verification.ok) {
      throw copyError(verification);
    }

    await driver.commitTargetTransaction();
    return {source, normalization, verification};
  } catch (error) {
    if (transactionStarted) {
      try {
        await driver.rollbackTargetTransaction();
      } catch {
        // Preserve the original copy/verification error. Recovery will inspect
        // the durable migration state before deciding whether to discard target.
      }
    }
    throw error;
  }
};
