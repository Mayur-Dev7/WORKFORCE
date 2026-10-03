import { pool, withTransaction } from '../lib/db.js';
import { usersRepository } from '../repositories/users.repository.js';
import { officesRepository } from '../repositories/offices.repository.js';
import { faceTemplatesRepository } from '../repositories/faceTemplates.repository.js';
import { attendanceRepository, AttendanceSessionRow } from '../repositories/attendance.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { loginAttemptsRepository } from '../repositories/loginAttempts.repository.js';
import { faceService } from './face.service.js';
import { livenessService } from './liveness.service.js';
import { geoService } from './geo.service.js';
import {
  ErrorCode,
  AuditAction,
  LoginEventType,
  AttendanceSession,
  CheckInRequest,
  CheckOutRequest,
} from '@workforce/shared';

function mapSessionRowToSession(row: AttendanceSessionRow): AttendanceSession {
  return {
    id: row.id,
    company_id: row.company_id,
    user_id: row.user_id,
    office_id: row.office_id,
    check_in_at: row.check_in_at.toISOString(),
    check_out_at: row.check_out_at ? row.check_out_at.toISOString() : null,
    check_in_latitude: row.check_in_latitude,
    check_in_longitude: row.check_in_longitude,
    check_in_accuracy_meters: row.check_in_accuracy_meters,
    check_in_distance_meters: row.check_in_distance_meters,
    check_in_face_similarity: row.check_in_face_similarity,
    check_in_liveness_score: row.check_in_liveness_score,
    check_out_latitude: row.check_out_latitude,
    check_out_longitude: row.check_out_longitude,
    check_out_accuracy_meters: row.check_out_accuracy_meters,
    check_out_distance_meters: row.check_out_distance_meters,
    check_out_face_similarity: row.check_out_face_similarity,
    check_out_liveness_score: row.check_out_liveness_score,
    auto_closed: row.auto_closed,
    auto_close_reason: row.auto_close_reason,
    created_at: row.created_at.toISOString(),
    user_name: row.user_name,
    employee_code: row.employee_code,
    user_email: row.user_email,
    office_name: row.office_name,
    department_name: row.department_name,
  };
}

export class AttendanceService {
  async processCheckIn(
    req: CheckInRequest,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<AttendanceSession> {
    // 1. Employee lookup
    const user = await usersRepository.findByCodeOrEmail(req.employeeCodeOrEmail);
    if (!user) {
      await loginAttemptsRepository.create({
        event_type: LoginEventType.UNKNOWN_EMPLOYEE,
        failure_reason: `Unknown employee for check-in: ${req.employeeCodeOrEmail}`,
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
        latitude: req.latitude,
        longitude: req.longitude,
      });
      const err = new Error('Employee not found with provided identifier');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    if (!user.is_active) {
      await loginAttemptsRepository.create({
        user_id: user.id,
        event_type: LoginEventType.DISABLED_ACCOUNT,
        failure_reason: 'Check-in attempted on disabled account',
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
      });
      const err = new Error('Employee account is inactive or disabled');
      (err as any).code = ErrorCode.ACCOUNT_DISABLED;
      throw err;
    }

    // 2. Face enrollment check
    if (!user.face_enrolled) {
      const err = new Error('Biometric face profile has not been enrolled for this employee');
      (err as any).code = ErrorCode.FACE_NOT_ENROLLED;
      throw err;
    }

    const faceTemplate = await faceTemplatesRepository.findByUserId(user.id);
    if (!faceTemplate || !faceTemplate.embedding || faceTemplate.embedding.length === 0) {
      const err = new Error('Enrolled face biometric template is missing or corrupted');
      (err as any).code = ErrorCode.FACE_NOT_ENROLLED;
      throw err;
    }

    // 3. Face verification (1:1)
    const faceMatch = faceService.compareEmbeddings(req.embedding, faceTemplate.embedding);
    if (!faceMatch.matched) {
      await loginAttemptsRepository.create({
        user_id: user.id,
        event_type: LoginEventType.FAILED_FACE,
        failure_reason: `Face similarity ${faceMatch.similarity} below threshold ${faceMatch.threshold}`,
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
        latitude: req.latitude,
        longitude: req.longitude,
      });
      const err = new Error(faceMatch.message || 'Face verification failed');
      (err as any).code = ErrorCode.FACE_MISMATCH;
      (err as any).details = { similarity: faceMatch.similarity, threshold: faceMatch.threshold };
      throw err;
    }

    // 4. Liveness check
    const liveness = livenessService.validateLivenessScore(req.livenessScore, 0.5);
    if (!liveness.passed) {
      await loginAttemptsRepository.create({
        user_id: user.id,
        event_type: LoginEventType.FAILED_LIVENESS,
        failure_reason: `Liveness score ${liveness.score} below threshold`,
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
      });
      const err = new Error(liveness.message || 'Liveness anti-spoof check failed');
      (err as any).code = ErrorCode.LIVENESS_FAILED;
      (err as any).details = { livenessScore: liveness.score };
      throw err;
    }

    // 5. GPS Accuracy validation
    const accuracyCheck = geoService.validateAccuracy(req.accuracy);
    if (!accuracyCheck.valid) {
      const err = new Error(accuracyCheck.message || 'Location accuracy too low');
      (err as any).code = accuracyCheck.error;
      throw err;
    }

    if (!user.company_id || !user.office_id) {
      const err = new Error('User is not associated with an active company or office');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    // 6. Office & Geofence validation (strictly scoped to user company)
    const office = await officesRepository.findById(user.office_id, undefined, user.company_id);
    if (!office || !office.is_active) {
      const err = new Error('Assigned office is inactive or unavailable');
      (err as any).code = ErrorCode.OUTSIDE_GEOFENCE;
      throw err;
    }

    const geoResult = geoService.calculateGeofence(
      req.latitude,
      req.longitude,
      office.latitude,
      office.longitude,
      office.radius_meters
    );

    if (!geoResult.insideGeofence) {
      await loginAttemptsRepository.create({
        company_id: user.company_id,
        user_id: user.id,
        event_type: LoginEventType.FAILED_GEOFENCE,
        failure_reason: `Distance ${geoResult.distanceMeters}m exceeds radius ${geoResult.allowedRadiusMeters}m`,
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
        latitude: req.latitude,
        longitude: req.longitude,
        distance_meters: geoResult.distanceMeters,
      });

      const err = new Error(
        `Outside office geofence. Distance: ${geoResult.distanceMeters}m, Allowed radius: ${geoResult.allowedRadiusMeters}m.`
      );
      (err as any).code = ErrorCode.OUTSIDE_GEOFENCE;
      (err as any).details = geoResult;
      throw err;
    }

    // 7. Atomic transaction check-in with database-level concurrency protection
    return withTransaction(async (client) => {
      // Check existing open session with FOR UPDATE locking
      const existingSession = await attendanceRepository.findActiveSessionForUpdate(user.id, client);
      if (existingSession) {
        const err = new Error('You already have an open attendance check-in session today.');
        (err as any).code = ErrorCode.ALREADY_CHECKED_IN;
        throw err;
      }

      const newSession = await attendanceRepository.createCheckIn(
        {
          company_id: user.company_id!,
          user_id: user.id,
          office_id: user.office_id!,
          check_in_latitude: req.latitude,
          check_in_longitude: req.longitude,
          check_in_accuracy_meters: req.accuracy,
          check_in_distance_meters: geoResult.distanceMeters,
          check_in_face_similarity: faceMatch.similarity,
          check_in_liveness_score: liveness.score,
        },
        client
      );

      // Audit log
      await auditLogsRepository.create(
        {
          company_id: user.company_id,
          actor_user_id: user.id,
          action: AuditAction.ATTENDANCE_CHECKED_IN,
          entity_type: 'attendance_session',
          entity_id: newSession.id,
          metadata: {
            officeId: user.office_id,
            distanceMeters: geoResult.distanceMeters,
            similarity: faceMatch.similarity,
            livenessScore: liveness.score,
          },
        },
        client
      );

      return mapSessionRowToSession(newSession);
    });
  }

  async processCheckOut(
    req: CheckOutRequest,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<AttendanceSession> {
    // 1. Employee lookup
    const user = await usersRepository.findByCodeOrEmail(req.employeeCodeOrEmail);
    if (!user) {
      const err = new Error('Employee not found');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Employee account is inactive or disabled');
      (err as any).code = ErrorCode.ACCOUNT_DISABLED;
      throw err;
    }

    // 2. Face verification
    const faceTemplate = await faceTemplatesRepository.findByUserId(user.id);
    if (!faceTemplate || !faceTemplate.embedding || faceTemplate.embedding.length === 0) {
      const err = new Error('Face template missing for employee');
      (err as any).code = ErrorCode.FACE_NOT_ENROLLED;
      throw err;
    }

    const faceMatch = faceService.compareEmbeddings(req.embedding, faceTemplate.embedding);
    if (!faceMatch.matched) {
      const err = new Error(faceMatch.message || 'Face verification failed');
      (err as any).code = ErrorCode.FACE_MISMATCH;
      (err as any).details = { similarity: faceMatch.similarity, threshold: faceMatch.threshold };
      throw err;
    }

    // 3. Liveness check
    const liveness = livenessService.validateLivenessScore(req.livenessScore, 0.5);
    if (!liveness.passed) {
      const err = new Error(liveness.message || 'Liveness anti-spoof check failed');
      (err as any).code = ErrorCode.LIVENESS_FAILED;
      throw err;
    }

    // 4. GPS Accuracy validation
    const accuracyCheck = geoService.validateAccuracy(req.accuracy);
    if (!accuracyCheck.valid) {
      const err = new Error(accuracyCheck.message || 'Location accuracy too low');
      (err as any).code = accuracyCheck.error;
      throw err;
    }

    // 5. Office & Geofence (strictly scoped to user company)
    if (!user.company_id || !user.office_id) {
      const err = new Error('User is not associated with an active company or office');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    const office = await officesRepository.findById(user.office_id, undefined, user.company_id);
    if (!office || !office.is_active) {
      const err = new Error('Office not found or inactive');
      (err as any).code = ErrorCode.OUTSIDE_GEOFENCE;
      throw err;
    }

    const geoResult = geoService.calculateGeofence(
      req.latitude,
      req.longitude,
      office.latitude,
      office.longitude,
      office.radius_meters
    );

    if (!geoResult.insideGeofence) {
      const err = new Error(
        `Outside office geofence. Distance: ${geoResult.distanceMeters}m, Allowed: ${geoResult.allowedRadiusMeters}m`
      );
      (err as any).code = ErrorCode.OUTSIDE_GEOFENCE;
      (err as any).details = geoResult;
      throw err;
    }

    // 6. Close session atomically
    return withTransaction(async (client) => {
      const activeSession = await attendanceRepository.findActiveSessionForUpdate(user.id, client);
      if (!activeSession) {
        const err = new Error('No open attendance check-in session found to check out from.');
        (err as any).code = ErrorCode.NO_ACTIVE_CHECKIN;
        throw err;
      }

      const closedSession = await attendanceRepository.closeSession(
        activeSession.id,
        {
          check_out_latitude: req.latitude,
          check_out_longitude: req.longitude,
          check_out_accuracy_meters: req.accuracy,
          check_out_distance_meters: geoResult.distanceMeters,
          check_out_face_similarity: faceMatch.similarity,
          check_out_liveness_score: liveness.score,
        },
        client
      );

      await auditLogsRepository.create(
        {
          company_id: user.company_id,
          actor_user_id: user.id,
          action: AuditAction.ATTENDANCE_CHECKED_OUT,
          entity_type: 'attendance_session',
          entity_id: closedSession.id,
          metadata: {
            officeId: user.office_id,
            distanceMeters: geoResult.distanceMeters,
            similarity: faceMatch.similarity,
            livenessScore: liveness.score,
          },
        },
        client
      );

      return mapSessionRowToSession(closedSession);
    });
  }

  async getActiveSession(userId: string): Promise<AttendanceSession | null> {
    const row = await attendanceRepository.findActiveSessionByUserId(userId);
    return row ? mapSessionRowToSession(row) : null;
  }

  async getUserHistory(userId: string, limit = 50, month?: string, companyId?: string): Promise<AttendanceSession[]> {
    const rows = await attendanceRepository.getUserHistory(userId, limit, month, companyId);
    return rows.map(mapSessionRowToSession);
  }

  async getTeamAttendance(companyId: string, officeId?: string, departmentId?: string, limit = 100): Promise<AttendanceSession[]> {
    const rows = await attendanceRepository.getTeamAttendance(companyId, officeId, departmentId, limit);
    return rows.map(mapSessionRowToSession);
  }
}

export const attendanceService = new AttendanceService();
