import { z } from 'zod';

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'Employee code or email is required'),
  password: z.string().min(1, 'Password is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const CheckInSchema = z.object({
  employeeCodeOrEmail: z.string().min(1, 'Employee identifier is required'),
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  accuracy: z.number().min(0, 'GPS accuracy must be a non-negative number'),
  embedding: z.array(z.number()).min(64, 'Biometric face embedding vector is required (at least 64 dimensions)'),
  livenessScore: z.number().min(0).max(1).optional(),
});

export const CheckOutSchema = z.object({
  employeeCodeOrEmail: z.string().min(1, 'Employee identifier is required'),
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  accuracy: z.number().min(0, 'GPS accuracy must be a non-negative number'),
  embedding: z.array(z.number()).min(64, 'Biometric face embedding vector is required (at least 64 dimensions)'),
  livenessScore: z.number().min(0).max(1).optional(),
});

export const CreateUserSchema = z.object({
  company_id: z.string().uuid('Invalid company UUID'),
  office_id: z.string().uuid('Invalid office UUID'),
  department_id: z.string().uuid('Invalid department UUID').nullable().optional(),
  role_id: z.string().uuid('Invalid role UUID'),
  employee_code: z.string().min(2, 'Employee code must have at least 2 characters'),
  name: z.string().min(2, 'Name must have at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must have at least 6 characters').optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  office_id: z.string().uuid().optional(),
  department_id: z.string().uuid().nullable().optional(),
  role_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export const EnrollFaceSchema = z.object({
  embedding: z.array(z.number()).min(64, 'Biometric face embedding vector must have at least 64 dimensions'),
  modelName: z.string().optional(),
  modelVersion: z.string().optional(),
  referenceImage: z.string().optional(),
});

export const CreateOfficeSchema = z.object({
  company_id: z.string().uuid('Invalid company UUID'),
  name: z.string().min(2, 'Office name is required'),
  address: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_meters: z.number().int().positive('Radius must be greater than 0 meters').default(150),
});

export const UpdateOfficeSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius_meters: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

export const CreateDepartmentSchema = z.object({
  company_id: z.string().uuid('Invalid company UUID'),
  name: z.string().min(2, 'Department name is required'),
});

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name is required'),
});

export const ReportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  officeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ALL']).optional(),
});

export const UpdateRolePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});
