import {decideTargetRecovery} from '../targetArtifact';
import type {MigrationCheckpoint} from '../migrationCheckpoint';

const checkpoint = (overrides: Partial<MigrationCheckpoint> = {}): MigrationCheckpoint => ({
  schemaVersion: 1,
  generation: 1,
  state: 'copying',
  source: 'zero-v3',
  sourceFingerprint: 'source-a',
  backup: {status: 'ready', descriptor: 'backup-a'},
  target: {databaseName: 'watermelon_v4', attemptId: '1:source-a', status: 'writing'},
  ...overrides,
});

describe('decideTargetRecovery', () => {
  it('creates a target only when the durable marker says it is absent', () => {
    expect(
      decideTargetRecovery(checkpoint({target: {...checkpoint().target, status: 'missing'}}), {kind: 'missing'}),
    ).toEqual({
      kind: 'create-fresh',
    });
  });

  it('resumes an owned writing target', () => {
    expect(
      decideTargetRecovery(checkpoint(), {
        kind: 'artifact',
        attemptId: '1:source-a',
        status: 'writing',
      }),
    ).toEqual({kind: 'resume-owned', attemptId: '1:source-a'});
  });

  it('blocks a target whose marker belongs to another attempt', () => {
    expect(
      decideTargetRecovery(checkpoint(), {
        kind: 'artifact',
        attemptId: '2:source-b',
        status: 'writing',
      }),
    ).toEqual({kind: 'blocked', reason: 'The target belongs to a different migration attempt'});
  });

  it('opens a verified target only when its checkpoint fingerprint matches', () => {
    const verified = checkpoint({
      state: 'verified',
      target: {...checkpoint().target, status: 'verified', fingerprint: 'target-a'},
    });
    expect(
      decideTargetRecovery(verified, {
        kind: 'artifact',
        attemptId: '1:source-a',
        status: 'verified',
        fingerprint: 'target-a',
      }),
    ).toEqual({kind: 'open-verified', attemptId: '1:source-a'});
    expect(
      decideTargetRecovery(verified, {
        kind: 'artifact',
        attemptId: '1:source-a',
        status: 'verified',
        fingerprint: 'target-b',
      }),
    ).toEqual({kind: 'blocked', reason: 'The verified target fingerprint does not match the checkpoint'});

    expect(
      decideTargetRecovery(checkpoint({state: 'verified', target: {...checkpoint().target, status: 'verified'}}), {
        kind: 'artifact',
        attemptId: '1:source-a',
        status: 'verified',
        fingerprint: 'target-a',
      }),
    ).toEqual({kind: 'blocked', reason: 'The verified target fingerprint does not match the checkpoint'});
  });

  it('never resets an unknown target observation', () => {
    expect(decideTargetRecovery(checkpoint(), {kind: 'unknown', reason: 'marker missing'})).toEqual({
      kind: 'blocked',
      reason: 'marker missing',
    });
  });
});
