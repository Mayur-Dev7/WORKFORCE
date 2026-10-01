import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const ShiftBreakSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Break name is required'),
  start_time: z.string().regex(timeRegex, 'Start time must be HH:MM or HH:MM:SS format'),
  end_time: z.string().regex(timeRegex, 'End time must be HH:MM or HH:MM:SS format'),
  duration_minutes: z.number().int().positive('Break duration must be a positive integer in minutes'),
  is_paid: z.boolean().optional().default(false),
});

export const CreateShiftSchema = z.object({
  company_id: z.string().uuid().optional(),
  office_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2, 'Shift name must have at least 2 characters'),
  start_time: z.string().regex(timeRegex, 'Start time must be in HH:MM format').default('09:00'),
  end_time: z.string().regex(timeRegex, 'End time must be in HH:MM format').default('17:00'),
  total_hours: z.number().positive('Total office hours must be greater than 0').default(8.0),
  is_default: z.boolean().optional().default(false),
  breaks: z.array(ShiftBreakSchema).optional().default([]),
});

export const UpdateShiftSchema = z.object({
  office_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2, 'Shift name must have at least 2 characters').optional(),
  start_time: z.string().regex(timeRegex, 'Start time must be in HH:MM format').optional(),
  end_time: z.string().regex(timeRegex, 'End time must be in HH:MM format').optional(),
  total_hours: z.number().positive('Total office hours must be greater than 0').optional(),
  is_default: z.boolean().optional(),
  breaks: z.array(ShiftBreakSchema).optional(),
});
