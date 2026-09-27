import crypto from 'crypto';
import { ErrorCode } from '@workforce/shared';

export type LivenessAction = 'TURN_LEFT' | 'TURN_RIGHT' | 'BLINK' | 'SMILE' | 'NOD_UP';

export interface LivenessChallenge {
  challengeId: string;
  actions: LivenessAction[];
  expiresAt: number;
}

export interface LivenessVerificationResult {
  passed: boolean;
  score: number;
  error?: ErrorCode;
  message?: string;
}

export class LivenessService {
  private activeChallenges = new Map<string, { actions: LivenessAction[]; expiresAt: number }>();
  private readonly challengeTtlMs = 60000; // 60 seconds

  /**
   * Generates a non-predictable, randomized liveness challenge sequence
   */
  generateChallenge(): LivenessChallenge {
    const allActions: LivenessAction[] = ['TURN_LEFT', 'TURN_RIGHT', 'BLINK', 'SMILE'];
    
    // Pick 2 randomized distinct actions
    const shuffled = [...allActions].sort(() => 0.5 - Math.random());
    const selectedActions = shuffled.slice(0, 2);

    const challengeId = crypto.randomUUID();
    const expiresAt = Date.now() + this.challengeTtlMs;

    this.activeChallenges.set(challengeId, {
      actions: selectedActions,
      expiresAt,
    });

    // Cleanup expired challenges
    this.cleanupExpiredChallenges();

    return {
      challengeId,
      actions: selectedActions,
      expiresAt,
    };
  }

  /**
   * Validates liveness score and anti-spoof checks
   */
  validateLivenessScore(
    score: number | undefined,
    minThreshold = 0.6
  ): LivenessVerificationResult {
    if (score === undefined || isNaN(score)) {
      return {
        passed: false,
        score: 0,
        error: ErrorCode.LIVENESS_FAILED,
        message: 'Liveness anti-spoof check score was not supplied',
      };
    }

    if (score < minThreshold) {
      return {
        passed: false,
        score,
        error: ErrorCode.LIVENESS_FAILED,
        message: `Anti-spoof liveness check failed (Score: ${(score * 100).toFixed(1)}%, Minimum: ${(minThreshold * 100).toFixed(0)}%). Please repeat the motion challenge.`,
      };
    }

    return {
      passed: true,
      score,
      message: 'Liveness anti-spoof challenge passed',
    };
  }

  /**
   * Validates a completed challenge with challengeId
   */
  verifyChallenge(
    challengeId: string,
    completedActions: LivenessAction[]
  ): { valid: boolean; error?: ErrorCode; message?: string } {
    const entry = this.activeChallenges.get(challengeId);
    if (!entry) {
      return {
        valid: false,
        error: ErrorCode.LIVENESS_FAILED,
        message: 'Liveness challenge expired or not found. Please request a new challenge.',
      };
    }

    if (Date.now() > entry.expiresAt) {
      this.activeChallenges.delete(challengeId);
      return {
        valid: false,
        error: ErrorCode.LIVENESS_FAILED,
        message: 'Liveness challenge has expired. Please retry.',
      };
    }

    // Verify all requested actions were performed
    const expected = entry.actions;
    const isMatching = expected.every((action, idx) => completedActions[idx] === action);

    // One-time use: consume challenge
    this.activeChallenges.delete(challengeId);

    if (!isMatching) {
      return {
        valid: false,
        error: ErrorCode.LIVENESS_FAILED,
        message: 'Liveness challenge movements did not match required sequence.',
      };
    }

    return { valid: true };
  }

  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [id, data] of this.activeChallenges.entries()) {
      if (now > data.expiresAt) {
        this.activeChallenges.delete(id);
      }
    }
  }
}

export const livenessService = new LivenessService();
