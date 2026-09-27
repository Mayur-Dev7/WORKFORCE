/**
 * Calculates cosine similarity between two vector embeddings.
 * Range: -1.0 to 1.0 (with 1.0 being exact identity match).
 */
export function cosineSimilarity(embeddingA: number[], embeddingB: number[]): number {
  if (!embeddingA || !embeddingB || embeddingA.length === 0 || embeddingB.length === 0) {
    return 0;
  }

  if (embeddingA.length !== embeddingB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    normA += embeddingA[i] * embeddingA[i];
    normB += embeddingB[i] * embeddingB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalizes an embedding vector to unit length
 */
export function normalizeEmbedding(vector: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  const magnitude = Math.sqrt(norm);
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}
