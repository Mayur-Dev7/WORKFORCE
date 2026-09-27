import { RoleName, PermissionKey, ErrorCode, AuditAction, LoginEventType } from '../enums/index.js';

export interface User {
  id: string;
  company_id: string;
  office_id: string;
  department_id: string | null;
  role_id: string;
  employee_code: string;
  name: string;
  email: string;
  is_active: boolean;
  face_enrolled: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;

  // Joined fields for display
  company_name?: string;
  office_name?: string;
  department_name?: string;
  role_name?: RoleName;
  permissions?: PermissionKey[];
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Office {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employee_count?: number;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  employee_count?: number;
}

export interface Role {
  id: string;
  name: RoleName;
  description: string | null;
  created_at: string;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  key: PermissionKey;
  description: string | null;
}

export interface AttendanceSession {
  id: string;
  user_id: string;
  office_id: string;
  check_in_at: string;
  check_out_at: string | null;

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

  created_at: string;

  // Joined fields
  user_name?: string;
  employee_code?: string;
  user_email?: string;
  office_name?: string;
  department_name?: string;
}

export interface LoginAttempt {
  id: string;
  user_id: string | null;
  event_type: LoginEventType;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  created_at: string;
  employee_code?: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: AuditAction | string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string;
  actor_email?: string;
}

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export interface GeofenceValidationResult {
  insideGeofence: boolean;
  distanceMeters: number;
  allowedRadiusMeters: number;
}

export interface CheckInRequest {
  employeeCodeOrEmail: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  embedding: number[];
  livenessScore?: number;
}

export interface CheckOutRequest {
  employeeCodeOrEmail: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  embedding: number[];
  livenessScore?: number;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  user: User;
}

export interface AttendanceReportItem {
  id: string;
  employee_code: string;
  employee_name: string;
  department_name: string;
  office_name: string;
  check_in_at: string;
  check_out_at: string | null;
  duration_minutes: number | null;
  check_in_distance_meters: number;
  check_in_face_similarity: number;
  status: 'COMPLETED' | 'ACTIVE';
}

// ─── Leave Management ────────────────────────────────────────────────────────

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  id: string;
  company_id: string;
  code: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  leave_year: number;
  allocated_days: number;
  used_days: number;
  pending_days: number;
  created_at: string;
  updated_at: string;

  // Joined
  leave_type_code?: string;
  leave_type_name?: string;
  remaining_days?: number;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: LeaveStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  user_name?: string;
  employee_code?: string;
  leave_type_name?: string;
  leave_type_code?: string;
  reviewer_name?: string;
}

// ─── Holiday Calendar ────────────────────────────────────────────────────────

export interface Holiday {
  id: string;
  company_id: string;
  office_id: string | null;
  name: string;
  description: string | null;
  holiday_date: string;
  is_recurring: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeeklyHolidayRule {
  id: string;
  company_id: string;
  day_of_week: number;
  week_of_month: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
