import {verifyCopiedRows, type CopyDataset, type CopyVerificationReport} from './copyVerification';
import {normalizeLegacyRows, type CopyNormalizationResult} from './copyNormalization';
import type {LegacyDatabaseSource} from './legacySchema';

/**
 * Native/Watermelon adapter boundary for a copy-on-write migration. The
 * source snapshot must be read in one consistent native transaction; the
 * target writer must be a fresh v4 database and expose rollback semantics.
 */
export interface LegacyCopyDriver {
  readSourceSnapshot: () => Promise<CopyDataset>;
  ensureBackup: () => Promise<void>;
  prepareTarget: () => Promise<void>;
  /**
   * Writes every table, reads the target back, invokes verify, and commits
   * only when verify returns an ok report. The driver owns rollback semantics.
   */
  runTargetTransaction: (
    expectedTarget: CopyDataset,
    verify: (actualTarget: CopyDataset) => CopyVerificationReport,
  ) => Promise<CopyVerificationReport>;
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
  const verification = await driver.runTargetTransaction(normalization.dataset, actualTarget => {
    const report = verifyCopiedRows({
      source: sourceRows,
      expectedTarget: normalization.dataset,
      actualTarget,
    });
    if (!report.ok) {
      throw copyError(report);
    }
    return report;
  });
  return {source, normalization, verification};
};
