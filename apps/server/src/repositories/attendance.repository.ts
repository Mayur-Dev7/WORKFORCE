import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { AttendanceSession, AttendanceReportItem } from '@workforce/shared';

export interface AttendanceSessionRow {
  id: string;
  company_id: string;
  user_id: string;
  office_id: string;
  check_in_at: Date;
  check_out_at: Date | null;
  check_in_latitude: number;
  check_in_longitude: number;
  check_in_accuracy_meters: number | null;
  check_in_distance_meters: number;
  check_in_face_similarity: number;
  check_in_liveness_score: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_out_accuracy_meters: number | null;
  check_out_distance_meters: number | null;
  check_out_face_similarity: number | null;
  check_out_liveness_score: number | null;
  auto_closed?: boolean;
  auto_close_reason?: string | null;
  created_at: Date;

  user_name?: string;
  employee_code?: string;
  user_email?: string;
  office_name?: string;
  department_name?: string;
}

export class AttendanceRepository {
  private baseSelect = `
    SELECT 
      s.id,
      s.company_id,
      s.user_id,
      s.office_id,
      s.check_in_at,
      s.check_out_at,
      s.check_in_latitude,
      s.check_in_longitude,
      s.check_in_accuracy_meters,
      s.check_in_distance_meters,
      s.check_in_face_similarity,
      s.check_in_liveness_score,
      s.check_out_latitude,
      s.check_out_longitude,
      s.check_out_accuracy_meters,
      s.check_out_distance_meters,
      s.check_out_face_similarity,
      s.check_out_liveness_score,
      s.auto_closed,
      s.auto_close_reason,
      s.created_at,
      u.name as user_name,
      u.employee_code,
      u.email as user_email,
      o.name as office_name,
      d.name as department_name
    FROM attendance_sessions s
    JOIN users u ON s.user_id = u.id
    JOIN offices o ON s.office_id = o.id
    LEFT JOIN departments d ON u.department_id = d.id
  `;

  async findActiveSessionByUserId(userId: string, client?: PoolClient): Promise<AttendanceSessionRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE s.user_id = $1 AND s.check_out_at IS NULL
      LIMIT 1
    `;
    const res = await queryClient.query<AttendanceSessionRow>(query, [userId]);
    return res.rows[0] || null;
  }

  /**
   * Finds active session for update with row-level locking
   */
  async findActiveSessionForUpdate(userId: string, client: PoolClient): Promise<AttendanceSessionRow | null> {
    const query = `
      SELECT 
        s.id,
        s.user_id,
        s.office_id,
        s.check_in_at,
        s.check_out_at,
        s.check_in_latitude,
        s.check_in_longitude,
        s.check_in_accuracy_meters,
        s.check_in_distance_meters,
        s.check_in_face_similarity,
        s.check_in_liveness_score,
        s.check_out_latitude,
        s.check_out_longitude,
        s.check_out_accuracy_meters,
        s.check_out_distance_meters,
        s.check_out_face_similarity,
        s.check_out_liveness_score,
        s.created_at
      FROM attendance_sessions s
      WHERE s.user_id = $1 AND s.check_out_at IS NULL
      FOR UPDATE
    `;
    const res = await client.query<AttendanceSessionRow>(query, [userId]);
    return res.rows[0] || null;
  }

  createCheckIn = this.createSession.bind(this);

  async createSession(
    session: {
      company_id: string;
      user_id: string;
      office_id: string;
      check_in_latitude: number;
      check_in_longitude: number;
      check_in_accuracy_meters: number | null;
      check_in_distance_meters: number;
      check_in_face_similarity: number;
      check_in_liveness_score: number | null;
    },
    client: PoolClient
  ): Promise<AttendanceSessionRow> {
    const insertQuery = `
      INSERT INTO attendance_sessions (
        company_id,
        user_id,
        office_id,
        check_in_at,
        check_in_latitude,
        check_in_longitude,
        check_in_accuracy_meters,
        check_in_distance_meters,
        check_in_face_similarity,
        check_in_liveness_score
      )
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    const res = await client.query<{ id: string }>(insertQuery, [
      session.company_id,
      session.user_id,
      session.office_id,
      session.check_in_latitude,
      session.check_in_longitude,
      session.check_in_accuracy_meters,
      session.check_in_distance_meters,
      session.check_in_face_similarity,
      session.check_in_liveness_score,
    ]);

    const created = await this.findById(res.rows[0].id, client);
    if (!created) {
      throw new Error('Failed to retrieve newly created attendance session');
    }
    return created;
  }

  async closeSession(
    sessionId: string,
    checkout: {
      check_out_latitude: number;
      check_out_longitude: number;
      check_out_accuracy_meters: number | null;
      check_out_distance_meters: number;
      check_out_face_similarity: number;
      check_out_liveness_score: number | null;
    },
    client: PoolClient
  ): Promise<AttendanceSessionRow> {
    const updateQuery = `
      UPDATE attendance_sessions
      SET
        check_out_at = NOW(),
        check_out_latitude = $2,
        check_out_longitude = $3,
        check_out_accuracy_meters = $4,
        check_out_distance_meters = $5,
        check_out_face_similarity = $6,
        check_out_liveness_score = $7
      WHERE id = $1
      RETURNING id
    `;
    const res = await client.query<{ id: string }>(updateQuery, [
      sessionId,
      checkout.check_out_latitude,
      checkout.check_out_longitude,
      checkout.check_out_accuracy_meters,
      checkout.check_out_distance_meters,
      checkout.check_out_face_similarity,
      checkout.check_out_liveness_score,
    ]);

    if (res.rowCount === 0) {
      throw new Error('No active attendance session found to close');
    }

    const updated = await this.findById(res.rows[0].id, client);
    if (!updated) {
      throw new Error('Failed to retrieve updated attendance session');
    }
    return updated;
  }

  async autoCloseOpenSessionsForUser(
    userId: string,
    reason: 'left_company' | 'removed',
    client?: PoolClient
  ): Promise<number> {
    const queryClient = client || pool;
    const res = await queryClient.query(
      `UPDATE attendance_sessions
       SET check_out_at = NOW(),
           check_out_face_similarity = NULL,
           auto_closed = TRUE,
           auto_close_reason = $1
       WHERE user_id = $2 AND check_out_at IS NULL`,
      [reason, userId]
    );
    return res.rowCount ?? 0;
  }

  async findById(id: string, client?: PoolClient, companyId?: string): Promise<AttendanceSessionRow | null> {
    const queryClient = client || pool;
    let query = `
      ${this.baseSelect}
      WHERE s.id = $1
    `;
    const params: unknown[] = [id];
    if (companyId) {
      query += ` AND s.company_id = $2`;
      params.push(companyId);
    }
    const res = await queryClient.query<AttendanceSessionRow>(query, params);
    return res.rows[0] || null;
  }

  async getUserHistory(userId: string, limit = 50, month?: string, companyId?: string): Promise<AttendanceSessionRow[]> {
    let query = `
      ${this.baseSelect}
      WHERE s.user_id = $1
    `;
    const params: any[] = [userId];
    if (companyId) {
      params.push(companyId);
      query += ` AND s.company_id = $${params.length}`;
    }
    if (month) {
      params.push(month);
      query += ` AND TO_CHAR(s.check_in_at, 'YYYY-MM') = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY s.check_in_at DESC LIMIT $${params.length}`;
    const res = await pool.query<AttendanceSessionRow>(query, params);
    return res.rows;
  }

  async getTeamAttendance(companyId: string, officeId?: string, departmentId?: string, limit = 100): Promise<AttendanceSessionRow[]> {
    const conditions: string[] = ['s.company_id = $1'];
    const values: unknown[] = [companyId];
    let idx = 2;

    if (officeId) {
      conditions.push(`s.office_id = $${idx++}`);
      values.push(officeId);
    }
    if (departmentId) {
      conditions.push(`u.department_id = $${idx++}`);
      values.push(departmentId);
    }

    values.push(limit);
    const limitPlaceholder = `$${idx}`;

    const where = `WHERE ${conditions.join(' AND ')}`;
    const query = `
      ${this.baseSelect}
      ${where}
      ORDER BY s.check_in_at DESC
      LIMIT ${limitPlaceholder}
    `;
    const res = await pool.query<AttendanceSessionRow>(query, values);
    return res.rows;
  }

  async getReportData(filters: {
    companyId: string;
    startDate?: string;
    endDate?: string;
    officeId?: string;
    departmentId?: string;
    userId?: string;
    status?: 'ACTIVE' | 'COMPLETED' | 'ALL';
  }): Promise<AttendanceReportItem[]> {
    const conditions: string[] = ['s.company_id = $1'];
    const values: unknown[] = [filters.companyId];
    let idx = 2;

    if (filters.startDate) {
      conditions.push(`s.check_in_at >= $${idx++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`s.check_in_at <= $${idx++}`);
      values.push(filters.endDate);
    }
    if (filters.officeId) {
      conditions.push(`s.office_id = $${idx++}`);
      values.push(filters.officeId);
    }
    if (filters.departmentId) {
      conditions.push(`u.department_id = $${idx++}`);
      values.push(filters.departmentId);
    }
    if (filters.userId) {
      conditions.push(`s.user_id = $${idx++}`);
      values.push(filters.userId);
    }
    if (filters.status === 'ACTIVE') {
      conditions.push(`s.check_out_at IS NULL`);
    } else if (filters.status === 'COMPLETED') {
      conditions.push(`s.check_out_at IS NOT NULL`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        s.id,
        u.employee_code,
        u.name as employee_name,
        COALESCE(d.name, 'Unassigned') as department_name,
        o.name as office_name,
        s.check_in_at::text,
        s.check_out_at::text,
        CASE 
          WHEN s.check_out_at IS NOT NULL 
          THEN ROUND(EXTRACT(EPOCH FROM (s.check_out_at - s.check_in_at)) / 60)::int
          ELSE NULL 
        END as duration_minutes,
        s.check_in_distance_meters,
        s.check_in_face_similarity,
        CASE WHEN s.check_out_at IS NULL THEN 'ACTIVE' ELSE 'COMPLETED' END as status
      FROM attendance_sessions s
      JOIN users u ON s.user_id = u.id
      JOIN offices o ON s.office_id = o.id
      LEFT JOIN departments d ON u.department_id = d.id
      ${where}
      ORDER BY s.check_in_at DESC
    `;

    const res = await pool.query<AttendanceReportItem>(query, values);
    return res.rows;
  }

  async getAdminStats(companyId: string): Promise<{
    totalEmployees: number;
    activeEmployees: number;
    todayAttendance: number;
    currentlyCheckedIn: number;
    absentToday: number;
    failedFaceAttempts: number;
    failedGeofenceAttempts: number;
    employeesWithoutFace: number;
  }> {
    const query = `
      WITH today_start AS (
        SELECT date_trunc('day', NOW()) as start_time
      ),
      emp_counts AS (
        SELECT 
          COUNT(*)::int as total_employees,
          COUNT(*) FILTER (WHERE is_active = true)::int as active_employees,
          COUNT(*) FILTER (WHERE face_enrolled = false)::int as employees_without_face
        FROM users
        WHERE company_id = $1
      ),
      today_sessions AS (
        SELECT 
          COUNT(DISTINCT s.user_id)::int as today_attendance,
          COUNT(DISTINCT s.user_id) FILTER (WHERE s.check_out_at IS NULL)::int as currently_checked_in
        FROM attendance_sessions s
        CROSS JOIN today_start t
        WHERE s.company_id = $1 AND s.check_in_at >= t.start_time
      ),
      today_failures AS (
        SELECT 
          COUNT(*) FILTER (WHERE l.failure_reason ILIKE '%FACE%')::int as failed_face,
          COUNT(*) FILTER (WHERE l.failure_reason ILIKE '%GEOFENCE%')::int as failed_geofence
        FROM login_attempts l
        CROSS JOIN today_start t
        WHERE l.company_id = $1 AND l.created_at >= t.start_time
      )
      SELECT 
        ec.total_employees,
        ec.active_employees,
        ts.today_attendance,
        ts.currently_checked_in,
        GREATEST(ec.active_employees - ts.today_attendance, 0)::int as absent_today,
        tf.failed_face,
        tf.failed_geofence,
        ec.employees_without_face
      FROM emp_counts ec, today_sessions ts, today_failures tf;
    `;

    const res = await pool.query<{
      total_employees: number;
      active_employees: number;
      today_attendance: number;
      currently_checked_in: number;
      absent_today: number;
      failed_face: number;
      failed_geofence: number;
      employees_without_face: number;
    }>(query, [companyId]);

    const row = res.rows[0] || {
      total_employees: 0,
      active_employees: 0,
      today_attendance: 0,
      currently_checked_in: 0,
      absent_today: 0,
      failed_face: 0,
      failed_geofence: 0,
      employees_without_face: 0,
    };

    return {
      totalEmployees: row.total_employees,
      activeEmployees: row.active_employees,
      todayAttendance: row.today_attendance,
      currentlyCheckedIn: row.currently_checked_in,
      absentToday: row.absent_today,
      failedFaceAttempts: row.failed_face,
      failedGeofenceAttempts: row.failed_geofence,
      employeesWithoutFace: row.employees_without_face,
    };
  }
}

export const attendanceRepository = new AttendanceRepository();
