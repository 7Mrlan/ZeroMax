import type {MigrationCheckpoint} from './migrationCheckpoint';

export type TargetObservation =
  | {kind: 'missing'}
  | {kind: 'artifact'; attemptId: string; status: 'fresh' | 'writing' | 'verified'; fingerprint?: string}
  | {kind: 'unknown'; reason: string};

export type TargetRecoveryAction =
  | {kind: 'create-fresh'}
  | {kind: 'resume-owned'; attemptId: string}
  | {kind: 'open-verified'; attemptId: string}
  | {kind: 'discard-owned'; attemptId: string}
  | {kind: 'blocked'; reason: string};

/**
 * Decides what may happen to an inactive target without touching the file.
 * A target with no matching durable attempt marker is never reset blindly.
 */
export const decideTargetRecovery = (
  checkpoint: MigrationCheckpoint,
  target: TargetObservation,
): TargetRecoveryAction => {
  if (target.kind === 'unknown') {
    return {kind: 'blocked', reason: target.reason};
  }

  if (target.kind === 'missing') {
    return checkpoint.target.status === 'missing' || checkpoint.target.status === 'fresh'
      ? {kind: 'create-fresh'}
      : {kind: 'blocked', reason: 'The durable checkpoint expects a target that is no longer present'};
  }

  if (target.attemptId !== checkpoint.target.attemptId) {
    return {kind: 'blocked', reason: 'The target belongs to a different migration attempt'};
  }

  if (target.status === 'verified') {
    if (checkpoint.state !== 'verified' && checkpoint.state !== 'activated') {
      return {kind: 'discard-owned', attemptId: target.attemptId};
    }
    if (checkpoint.target.fingerprint === undefined || target.fingerprint !== checkpoint.target.fingerprint) {
      return {kind: 'blocked', reason: 'The verified target fingerprint does not match the checkpoint'};
    }
    return {kind: 'open-verified', attemptId: target.attemptId};
  }

  if (checkpoint.target.status === 'writing' || checkpoint.target.status === 'fresh') {
    return {kind: 'resume-owned', attemptId: target.attemptId};
  }

  return {kind: 'discard-owned', attemptId: target.attemptId};
};
