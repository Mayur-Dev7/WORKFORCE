import { describe, it, expect } from 'vitest';
import { faceService } from '../../src/services/face.service.js';
import { cosineSimilarity, normalizeEmbedding } from '../../src/lib/face/similarity.js';
import { ErrorCode } from '@workforce/shared';
import { generateSyntheticEmbedding } from '../../db/seeds/seed.js';

describe('Face Verification Biometric Unit Tests', () => {
  const embeddingA = generateSyntheticEmbedding(42);
  const identicalEmbeddingA = [...embeddingA];
  const distinctEmbeddingB = generateSyntheticEmbedding(999);

  it('calculates 1.0 similarity for identical normalized embeddings', () => {
    const similarity = cosineSimilarity(embeddingA, identicalEmbeddingA);
    expect(similarity).toBeCloseTo(1.0, 4);
  });

  it('normalizes vector embeddings to unit length', () => {
    const unnormalized = [3, 4];
    const normalized = normalizeEmbedding(unnormalized);
    const length = Math.sqrt(normalized[0] * normalized[0] + normalized[1] * normalized[1]);
    expect(length).toBeCloseTo(1.0, 5);
  });

  it('matches when similarity exceeds the threshold', () => {
    const result = faceService.compareEmbeddings(embeddingA, identicalEmbeddingA, 0.65);
    expect(result.matched).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.65);
    expect(result.error).toBeUndefined();
  });

  it('fails verification when similarity is below threshold', () => {
    const result = faceService.compareEmbeddings(embeddingA, distinctEmbeddingB, 0.95);
    expect(result.matched).toBe(false);
    expect(result.error).toBe(ErrorCode.FACE_MISMATCH);
  });

  it('validates face detection counts', () => {
    expect(faceService.validateFaceCount(0).valid).toBe(false);
    expect(faceService.validateFaceCount(0).error).toBe(ErrorCode.FACE_NOT_DETECTED);

    expect(faceService.validateFaceCount(2).valid).toBe(false);
    expect(faceService.validateFaceCount(2).error).toBe(ErrorCode.MULTIPLE_FACES);

    expect(faceService.validateFaceCount(1).valid).toBe(true);
  });

  it('validates quality scores', () => {
    expect(faceService.validateQuality(0.85).valid).toBe(true);
    expect(faceService.validateQuality(0.2).valid).toBe(false);
  });
});
