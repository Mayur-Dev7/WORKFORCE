import { z } from 'zod';

// ISO date string YYYY-MM-DD
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const ApplyLeaveSchema = z.object({
  leave_type_id: z.string().uuid('Invalid leave type UUID'),
  start_date: isoDate,
  end_date: isoDate,
  reason: z.string().max(500).nullable().optional(),
}).refine((d) => d.end_date >= d.start_date, {
  message: 'end_date must be on or after start_date',
  path: ['end_date'],
});

export const ReviewLeaveSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], {
    required_error: 'action is required: APPROVE or REJECT',
  }),
  reviewer_note: z.string().max(500).nullable().optional(),
});

export const LeaveQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  user_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AllocateBalanceSchema = z.object({
  user_id: z.string().uuid('Invalid user UUID'),
  leave_type_id: z.string().uuid('Invalid leave type UUID'),
  leave_year: z.number().int().min(2000).max(2100),
  allocated_days: z.number().min(0).max(365),
});

export const CreateLeaveTypeSchema = z.object({
  code: z.string().min(1).max(30).regex(/^[A-Z_]+$/, 'Code must be uppercase letters and underscores only (e.g. ANNUAL_LEAVE)'),
  name: z.string().min(2).max(100),
  annual_quota: z.number().min(0).max(365),
  is_paid: z.boolean().default(false),
});

export const UpdateLeaveTypeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  annual_quota: z.number().min(0).max(365).optional(),
  is_paid: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
