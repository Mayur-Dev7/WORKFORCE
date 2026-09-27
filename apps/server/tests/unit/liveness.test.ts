import { describe, it, expect } from 'vitest';
import { livenessService } from '../../src/services/liveness.service.js';
import { ErrorCode } from '@workforce/shared';

describe('Liveness Service Unit Tests', () => {
  it('generates non-predictable challenge sequences with challengeId', () => {
    const c1 = livenessService.generateChallenge();
    const c2 = livenessService.generateChallenge();

    expect(c1.challengeId).toBeDefined();
    expect(c2.challengeId).toBeDefined();
    expect(c1.challengeId).not.toBe(c2.challengeId);
    expect(c1.actions.length).toBeGreaterThan(0);
  });

  it('verifies valid completed challenge sequence', () => {
    const challenge = livenessService.generateChallenge();
    const res = livenessService.verifyChallenge(challenge.challengeId, challenge.actions);
    expect(res.valid).toBe(true);
  });

  it('fails verification if challenge sequence is wrong', () => {
    const challenge = livenessService.generateChallenge();
    const wrongActions: any = ['BLINK', 'BLINK', 'BLINK'];
    const res = livenessService.verifyChallenge(challenge.challengeId, wrongActions);
    expect(res.valid).toBe(false);
    expect(res.error).toBe(ErrorCode.LIVENESS_FAILED);
  });

  it('validates liveness anti-spoof score', () => {
    const pass = livenessService.validateLivenessScore(0.85);
    expect(pass.passed).toBe(true);

    const fail = livenessService.validateLivenessScore(0.3);
    expect(fail.passed).toBe(false);
    expect(fail.error).toBe(ErrorCode.LIVENESS_FAILED);

    const missing = livenessService.validateLivenessScore(undefined);
    expect(missing.passed).toBe(false);
    expect(missing.error).toBe(ErrorCode.LIVENESS_FAILED);
  });
});
