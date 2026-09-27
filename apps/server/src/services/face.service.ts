import { cosineSimilarity, normalizeEmbedding } from '../lib/face/similarity.js';
import { ErrorCode } from '@workforce/shared';

export interface FaceQualityResult {
  valid: boolean;
  score: number;
  reason?: string;
}

export interface VerificationResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  error?: ErrorCode;
  message?: string;
}

export class FaceService {
  private threshold: number;

  constructor() {
    this.threshold = process.env.FACE_MATCH_THRESHOLD
      ? parseFloat(process.env.FACE_MATCH_THRESHOLD)
      : 0.65;
  }

  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Validates face vector count and dimension
   */
  validateFaceCount(facesCount: number): { valid: boolean; error?: ErrorCode; message?: string } {
    if (facesCount === 0) {
      return {
        valid: false,
        error: ErrorCode.FACE_NOT_DETECTED,
        message: 'No face detected in camera view. Ensure your face is centered and illuminated.',
      };
    }
    if (facesCount > 1) {
      return {
        valid: false,
        error: ErrorCode.MULTIPLE_FACES,
        message: 'Multiple faces detected in frame. Only one individual must be in view.',
      };
    }
    return { valid: true };
  }

  /**
   * Validates quality score of captured face
   */
  validateQuality(qualityScore: number, minScore = 0.5): FaceQualityResult {
    if (qualityScore < minScore) {
      return {
        valid: false,
        score: qualityScore,
        reason: `Face quality score (${(qualityScore * 100).toFixed(1)}%) is below acceptable threshold (${(minScore * 100).toFixed(0)}%). Ensure direct lighting and no blur.`,
      };
    }
    return { valid: true, score: qualityScore };
  }

  /**
   * Generates a normalized biometric embedding from a raw descriptor array
   */
  generateEmbedding(rawDescriptor: number[]): number[] {
    if (!rawDescriptor || rawDescriptor.length === 0) {
      throw new Error('Descriptor array is required to generate embedding');
    }
    return normalizeEmbedding(rawDescriptor);
  }

  /**
   * Compares a candidate embedding against an enrolled face template
   */
  compareEmbeddings(
    candidateEmbedding: number[],
    enrolledEmbedding: number[],
    customThreshold?: number
  ): VerificationResult {
    const effectiveThreshold = customThreshold ?? this.threshold;

    if (!candidateEmbedding || candidateEmbedding.length === 0) {
      return {
        matched: false,
        similarity: 0,
        threshold: effectiveThreshold,
        error: ErrorCode.FACE_NOT_DETECTED,
        message: 'Candidate face biometric embedding was not provided or empty',
      };
    }

    if (!enrolledEmbedding || enrolledEmbedding.length === 0) {
      return {
        matched: false,
        similarity: 0,
        threshold: effectiveThreshold,
        error: ErrorCode.FACE_NOT_ENROLLED,
        message: 'Employee does not have an enrolled biometric face template',
      };
    }

    if (candidateEmbedding.length !== enrolledEmbedding.length) {
      return {
        matched: false,
        similarity: 0,
        threshold: effectiveThreshold,
        error: ErrorCode.FACE_MISMATCH,
        message: `Biometric template dimension mismatch (${candidateEmbedding.length} vs ${enrolledEmbedding.length}). Please re-enroll your reference face photo to update to the current model.`,
      };
    }

    const similarity = cosineSimilarity(candidateEmbedding, enrolledEmbedding);
    const matched = similarity >= effectiveThreshold;

    return {
      matched,
      similarity: Number(similarity.toFixed(4)),
      threshold: effectiveThreshold,
      error: matched ? undefined : ErrorCode.FACE_MISMATCH,
      message: matched
        ? 'Face verified successfully'
        : `Biometric verification failed. Face similarity (${(similarity * 100).toFixed(1)}%) did not meet threshold (${(effectiveThreshold * 100).toFixed(0)}%).`,
    };
  }
}

export const faceService = new FaceService();
