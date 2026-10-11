import type {ActiveDatabaseName} from './activeDatabase';
import {detectLegacyDatabaseSource, type LegacyDatabaseSource, type LegacySchemaSnapshot} from './legacySchema';

/**
 * Result returned by the future native read-only SQLite probe. The probe is
 * deliberately separate from WatermelonDB: constructing SQLiteAdapter opens
 * the file read-write and may reset an unknown schema.
 */
export type DatabaseProbeResult =
  | {kind: 'missing'}
  | {kind: 'metadata'; snapshot: LegacySchemaSnapshot; integrity: 'ok' | 'failed'}
  | {kind: 'error'; error: Error};

export type DatabasePreflightDecision =
  | {kind: 'fresh-target'; databaseName: 'watermelon_v4'}
  | {kind: 'copy-legacy'; source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>}
  | {kind: 'open-target'; databaseName: 'watermelon_v4'}
  | {kind: 'blocked'; reason: string; error?: Error};

/**
 * Converts read-only native metadata into a startup decision. Existing files
 * are never treated as fresh: unknown, corrupt, future, or pointer-mismatched
 * shapes stop startup before any Watermelon adapter is constructed.
 */
export const decideDatabasePreflight = (
  activeDatabase: ActiveDatabaseName,
  probe: DatabaseProbeResult,
): DatabasePreflightDecision => {
  if (probe.kind === 'missing') {
    return activeDatabase === 'watermelon'
      ? {kind: 'fresh-target', databaseName: 'watermelon_v4'}
      : {kind: 'blocked', reason: 'The active target database is missing'};
  }

  if (probe.kind === 'error') {
    return {kind: 'blocked', reason: 'The active database could not be inspected', error: probe.error};
  }

  if (probe.integrity === 'failed') {
    return {kind: 'blocked', reason: 'The active database failed SQLite integrity checks'};
  }

  const source = detectLegacyDatabaseSource(probe.snapshot);
  if (source === 'zero-v3' || source === 'zerox-v3') {
    return activeDatabase === 'watermelon'
      ? {kind: 'copy-legacy', source}
      : {kind: 'blocked', reason: 'The active pointer targets a database with a legacy schema'};
  }

  if (source === 'target-v4') {
    return activeDatabase === 'watermelon_v4'
      ? {kind: 'open-target', databaseName: 'watermelon_v4'}
      : {kind: 'blocked', reason: 'The legacy pointer targets a v4 database'};
  }

  return {kind: 'blocked', reason: 'The active database schema is unknown or unsupported'};
};

/**
 * A missing legacy file is only a fresh install when the inactive target is
 * also missing. An existing target needs checkpoint ownership/recovery before
 * any writable adapter is constructed.
 */
export const decideDatabasePreflightWithTarget = (
  activeDatabase: ActiveDatabaseName,
  activeProbe: DatabaseProbeResult,
  targetProbe: DatabaseProbeResult,
): DatabasePreflightDecision => {
  if (activeDatabase !== 'watermelon' || activeProbe.kind !== 'missing') {
    return decideDatabasePreflight(activeDatabase, activeProbe);
  }

  if (targetProbe.kind === 'missing') {
    return {kind: 'fresh-target', databaseName: 'watermelon_v4'};
  }
  if (targetProbe.kind === 'error') {
    return {kind: 'blocked', reason: 'The inactive target database could not be inspected', error: targetProbe.error};
  }
  if (targetProbe.integrity === 'failed') {
    return {kind: 'blocked', reason: 'The inactive target database failed SQLite integrity checks'};
  }

  return {
    kind: 'blocked',
    reason: 'An inactive target database exists and requires durable migration recovery',
  };
};
