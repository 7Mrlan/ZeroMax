import {planLegacyMigration, type LegacyMigrationPlan, type LegacySchemaSnapshot} from './legacySchema';

export type UpgradeState = 'pending' | 'copying' | 'verified' | 'activated' | 'failed';

export interface UpgradeVerification {
  ok: boolean;
  rowCountsMatch: boolean;
  amountSumsMatch: boolean;
  idsAndRelationsMatch: boolean;
  schemaAndIndexesMatch: boolean;
  reopenedReadWrite: boolean;
}

export interface DualDatabaseUpgradeDriver {
  inspectLegacySchema: () => Promise<LegacySchemaSnapshot>;
  ensureBackup: () => Promise<void>;
  persistState: (state: UpgradeState) => Promise<void>;
  copyToTarget: (plan: LegacyMigrationPlan) => Promise<void>;
  verifyTarget: () => Promise<UpgradeVerification>;
  activateTarget: () => Promise<void>;
}

export interface DualDatabaseUpgradeResult {
  source: LegacyMigrationPlan['source'];
  finalState: 'activated';
}

const verificationPassed = (verification: UpgradeVerification): boolean =>
  verification.ok &&
  verification.rowCountsMatch &&
  verification.amountSumsMatch &&
  verification.idsAndRelationsMatch &&
  verification.schemaAndIndexesMatch &&
  verification.reopenedReadWrite;

/**
 * Orchestrates a copy-on-write upgrade without touching the legacy database.
 * The concrete Watermelon adapter is injected later so every transition can
 * be tested without native SQLite or relying on unsafe conditional DDL.
 */
export const runDualDatabaseUpgrade = async (driver: DualDatabaseUpgradeDriver): Promise<DualDatabaseUpgradeResult> => {
  try {
    await driver.persistState('pending');
    const snapshot = await driver.inspectLegacySchema();
    const plan = planLegacyMigration(snapshot);
    if (plan.source === 'unknown' || plan.source === 'target-v4') {
      throw new Error(`Unsupported legacy database source: ${plan.source}`);
    }

    await driver.ensureBackup();
    await driver.persistState('copying');
    await driver.copyToTarget(plan);

    const verification = await driver.verifyTarget();
    if (!verificationPassed(verification)) {
      throw new Error('Target database verification failed');
    }

    await driver.persistState('verified');
    await driver.activateTarget();
    await driver.persistState('activated');
    return {source: plan.source, finalState: 'activated'};
  } catch (error) {
    // The old database remains active because activation only happens after
    // verification. Persisting failed lets BootGate resume or offer recovery.
    try {
      await driver.persistState('failed');
    } catch {
      // Preserve the original error; the next boot can inspect the last
      // durable state while keeping the legacy database active.
    }
    throw error;
  }
};
