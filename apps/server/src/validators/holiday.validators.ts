import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const CreateHolidaySchema = z.object({
  office_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(500).nullable().optional(),
  holiday_date: isoDate,
  is_recurring: z.boolean().default(false),
});

export const UpdateHolidaySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  holiday_date: isoDate.optional(),
  is_recurring: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const HolidayQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  office_id: z.string().uuid().nullable().optional(),
});

export const UpsertWeeklyRuleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  week_of_month: z.number().int().min(1).max(5).nullable().optional().default(null),
  is_active: z.boolean(),
});

export const BatchWeeklyRulesSchema = z.object({
  rules: z.array(UpsertWeeklyRuleSchema).max(20),
});
