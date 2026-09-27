import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';

export interface FaceTemplateRow {
  id: string;
  user_id: string;
  embedding: number[];
  model_name: string;
  model_version: string;
  reference_image?: string | null;
  created_at: Date;
  updated_at: Date;
}

export class FaceTemplatesRepository {
  async findByUserId(userId: string, client?: PoolClient): Promise<FaceTemplateRow | null> {
    const queryClient = client || pool;
    const query = `
      SELECT id, user_id, embedding, model_name, model_version, reference_image, created_at, updated_at
      FROM face_templates
      WHERE user_id = $1
    `;
    const res = await queryClient.query<FaceTemplateRow>(query, [userId]);
    return res.rows[0] || null;
  }

  async upsert(
    template: {
      user_id: string;
      embedding: number[];
      model_name: string;
      model_version: string;
      reference_image?: string | null;
    },
    client?: PoolClient
  ): Promise<FaceTemplateRow> {
    const queryClient = client || pool;
    const query = `
      INSERT INTO face_templates (user_id, embedding, model_name, model_version, reference_image, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        reference_image = COALESCE(EXCLUDED.reference_image, face_templates.reference_image),
        updated_at = NOW()
      RETURNING id, user_id, embedding, model_name, model_version, reference_image, created_at, updated_at
    `;
    const res = await queryClient.query<FaceTemplateRow>(query, [
      template.user_id,
      template.embedding,
      template.model_name,
      template.model_version,
      template.reference_image || null,
    ]);
    return res.rows[0];
  }

  async deleteByUserId(userId: string, client?: PoolClient): Promise<boolean> {
    const queryClient = client || pool;
    const res = await queryClient.query(`DELETE FROM face_templates WHERE user_id = $1`, [userId]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const faceTemplatesRepository = new FaceTemplatesRepository();
