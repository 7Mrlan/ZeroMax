import type {DatabasePreflightDecision} from './preflight';

export type BootReadyKind = 'fresh-target' | 'open-target' | 'migrated-legacy';

export type BootGateResult = {ok: true; kind: BootReadyKind} | {ok: false; reason: string; error?: Error};

export interface BootGateDependencies<TDatabase = unknown> {
  preflight: () => Promise<DatabasePreflightDecision>;
  createFreshTarget: () => Promise<TDatabase>;
  migrateLegacy: (source: 'zero-v3' | 'zerox-v3') => Promise<TDatabase>;
  adoptDatabase: (database: TDatabase) => Promise<void> | void;
  openActiveDatabase: () => Promise<void>;
}

/**
 * Runs readonly preflight before any writable adapter action. The caller must
 * inject the real migration coordinator for legacy sources; an absent or
 * failed coordinator cannot fall back to opening the legacy database.
 */
export const runBootGate = async <TDatabase>(
  dependencies: BootGateDependencies<TDatabase>,
): Promise<BootGateResult> => {
  let decision: DatabasePreflightDecision;
  try {
    decision = await dependencies.preflight();
  } catch (error) {
    return {
      ok: false,
      reason: 'Database preflight failed',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  try {
    if (decision.kind === 'blocked') {
      return {ok: false, reason: decision.reason, error: decision.error};
    }

    if (decision.kind === 'fresh-target') {
      const target = await dependencies.createFreshTarget();
      await dependencies.adoptDatabase(target);
      return {ok: true, kind: 'fresh-target'};
    }

    if (decision.kind === 'open-target') {
      await dependencies.openActiveDatabase();
      return {ok: true, kind: 'open-target'};
    }

    const migrated = await dependencies.migrateLegacy(decision.source);
    await dependencies.adoptDatabase(migrated);
    return {ok: true, kind: 'migrated-legacy'};
  } catch (error) {
    return {
      ok: false,
      reason: 'Database boot preparation failed',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};
