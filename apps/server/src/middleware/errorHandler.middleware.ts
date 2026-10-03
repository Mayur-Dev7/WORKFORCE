import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ErrorCode } from '@workforce/shared';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Check if error is a Zod validation error
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request payload validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // Check custom business error code
  const code = err.code || ErrorCode.INTERNAL_SERVER_ERROR;
  let status = err.statusCode || 500;

  switch (code) {
    case ErrorCode.INVALID_CREDENTIALS:
    case ErrorCode.UNAUTHORIZED:
      status = 401;
      break;
    case ErrorCode.PERMISSION_DENIED:
    case ErrorCode.FORBIDDEN:
    case ErrorCode.ACCOUNT_DISABLED:
    case ErrorCode.AUTH_METHOD_MISMATCH:
    case ErrorCode.ACCOUNT_NOT_PROVISIONED:
    case ErrorCode.SOLE_ADMIN_CANNOT_LEAVE:
    case ErrorCode.CANNOT_LEAVE_SOLE_ADMIN:
    case ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN:
    case ErrorCode.CANNOT_REMOVE_SOLE_ADMIN:
    case ErrorCode.CANNOT_REMOVE_SELF:
    case ErrorCode.USER_NOT_IN_COMPANY:
    case ErrorCode.CROSS_TENANT_FORBIDDEN:
      status = 403;
      break;
    case ErrorCode.USER_ALREADY_IN_COMPANY:
    case ErrorCode.ACCOUNT_IDENTITY_MISMATCH:
      status = 409;
      break;
    case ErrorCode.AUTH_METHOD_DEPRECATED:
      status = 410;
      break;
    case ErrorCode.USER_NOT_FOUND:
    case ErrorCode.INVITATION_NOT_FOUND:
      status = 404;
      break;
    case ErrorCode.FACE_NOT_ENROLLED:
    case ErrorCode.FACE_NOT_DETECTED:
    case ErrorCode.MULTIPLE_FACES:
    case ErrorCode.FACE_QUALITY_LOW:
    case ErrorCode.FACE_MISMATCH:
    case ErrorCode.LIVENESS_FAILED:
    case ErrorCode.LOCATION_PERMISSION_DENIED:
    case ErrorCode.LOCATION_UNAVAILABLE:
    case ErrorCode.LOCATION_ACCURACY_LOW:
    case ErrorCode.OUTSIDE_GEOFENCE:
    case ErrorCode.ALREADY_CHECKED_IN:
    case ErrorCode.NO_ACTIVE_CHECKIN:
    case ErrorCode.VALIDATION_ERROR:
      status = 400;
      break;
    case ErrorCode.RATE_LIMITED:
      status = 429;
      break;
    default:
      // Postgres unique constraint violation for attendance session
      if (err.code === '23505' && err.constraint === 'one_open_attendance_session_per_user') {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.ALREADY_CHECKED_IN,
            message: 'You already have an active check-in session.',
          },
        });
        return;
      }
      status = 500;
  }

  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message || 'Operation failed';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
