import { describe, it, expect, vi } from 'vitest';

vi.mock('@vladmandic/human', () => ({
  Human: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(true),
    warmup: vi.fn().mockResolvedValue(true),
    detect: vi.fn().mockResolvedValue({ face: [] }),
  })),
}));

import {
  cosineSimilarity,
  evaluateFaceMatch,
  buildCentroidTemplate,
  BIOMETRIC_MATCH_THRESHOLD,
} from '../../src/services/face.client.js';

describe('Face Client Biometric Matching Service', () => {
  it('confirms the biometric match threshold is set to 0.60 (60% match)', () => {
    expect(BIOMETRIC_MATCH_THRESHOLD).toBe(0.60);
  });

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical unit vectors', () => {
      const vec = [1, 0, 0];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
    });

    it('returns 0 for empty or mismatched vectors', () => {
      expect(cosineSimilarity([], [1, 2])).toBe(0);
      expect(cosineSimilarity([1], [1, 2])).toBe(0);
    });
  });

  describe('evaluateFaceMatch', () => {
    it('returns matched=false and 0% for empty embeddings', () => {
      const res = evaluateFaceMatch([], []);
      expect(res.matched).toBe(false);
      expect(res.displayPercentage).toBe(0);
      expect(res.rawCosine).toBe(0);
    });

    it('evaluates identical face embeddings as matched with 100% display score', () => {
      const vec = [0.6, 0.8];
      const res = evaluateFaceMatch(vec, vec);
      expect(res.matched).toBe(true);
      expect(res.rawCosine).toBeCloseTo(1.0, 4);
      expect(res.displayPercentage).toBe(100);
    });

    it('evaluates face matching the exact 0.60 threshold as matched with 60% display score', () => {
      // vecA = [1, 0], vecB = [0.6, 0.8] -> dot product = 0.60
      const vecA = [1, 0];
      const vecB = [0.6, 0.8];
      const res = evaluateFaceMatch(vecA, vecB);
      expect(res.matched).toBe(true);
      expect(res.rawCosine).toBeCloseTo(0.60, 4);
      expect(res.displayPercentage).toBe(60);
    });

    it('evaluates face with 0.70 similarity as matched with 70% display score', () => {
      // vecA = [1, 0], vecB = [0.7, Math.sqrt(1 - 0.49)]
      const vecA = [1, 0];
      const vecB = [0.7, Math.sqrt(0.51)];
      const res = evaluateFaceMatch(vecA, vecB);
      expect(res.matched).toBe(true);
      expect(res.rawCosine).toBeCloseTo(0.70, 4);
      expect(res.displayPercentage).toBe(70);
    });

    it('evaluates face with 0.80 similarity as matched with 80% display score', () => {
      const vecA = [1, 0];
      const vecB = [0.8, 0.6];
      const res = evaluateFaceMatch(vecA, vecB);
      expect(res.matched).toBe(true);
      expect(res.rawCosine).toBeCloseTo(0.80, 4);
      expect(res.displayPercentage).toBe(80);
    });

    it('rejects candidate with similarity below 0.60 as failure (< 60% display score)', () => {
      // similarity ~ 0.50
      const vecA = [1, 0];
      const vecB = [0.5, Math.sqrt(0.75)];
      const res = evaluateFaceMatch(vecA, vecB);
      expect(res.matched).toBe(false);
      expect(res.rawCosine).toBeCloseTo(0.50, 4);
      expect(res.displayPercentage).toBeLessThan(60);
      expect(res.displayPercentage).toBeGreaterThanOrEqual(40);
    });

    it('rejects candidate with orthogonal / different person features as low percentage', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      const res = evaluateFaceMatch(vecA, vecB);
      expect(res.matched).toBe(false);
      expect(res.displayPercentage).toBeLessThanOrEqual(20);
    });
  });

  describe('buildCentroidTemplate', () => {
    it('returns empty array when given empty list', () => {
      expect(buildCentroidTemplate([])).toEqual([]);
    });

    it('returns normalized average across multiple vector poses', () => {
      const v1 = [1, 0];
      const v2 = [0, 1];
      const centroid = buildCentroidTemplate([v1, v2]);
      const expectedNorm = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5);
      expect(centroid[0]).toBeCloseTo(0.5 / expectedNorm, 4);
      expect(centroid[1]).toBeCloseTo(0.5 / expectedNorm, 4);
    });
  });
});
