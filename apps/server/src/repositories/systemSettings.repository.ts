import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';

export interface BootstrapSetting {
  completed: boolean;
  completed_at: string | null;
}

export class SystemSettingsRepository {
  async getBootstrapSetting(client?: PoolClient): Promise<BootstrapSetting> {
    const queryClient = client || pool;
    const res = await queryClient.query<{ value: BootstrapSetting }>(
      `SELECT value FROM system_settings WHERE key = 'bootstrap'`
    );
    if (!res.rows[0]) {
      return { completed: false, completed_at: null };
    }
    return res.rows[0].value;
  }

  async setBootstrapCompleted(client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE system_settings
       SET value = jsonb_build_object('completed', true, 'completed_at', NOW()),
           updated_at = NOW()
       WHERE key = 'bootstrap'`
    );
  }
}

export const systemSettingsRepository = new SystemSettingsRepository();
