import { api } from './api.js';
import type { ApiResponse, Holiday, WeeklyHolidayRule } from '@workforce/shared';

// ─── Holidays ─────────────────────────────────────────────────────────────────

export const getHolidays = (params?: { year?: number; office_id?: string }) =>
  api.get<ApiResponse<Holiday[]>>('/holidays', { params });

export const createHoliday = (data: {
  office_id?: string;
  name: string;
  description?: string;
  holiday_date: string;
  is_recurring: boolean;
}) => api.post<ApiResponse<Holiday>>('/holidays', data);

export const updateHoliday = (
  id: string,
  data: Partial<{
    name: string;
    description: string;
    holiday_date: string;
    is_recurring: boolean;
    is_active: boolean;
  }>
) => api.patch<ApiResponse<Holiday>>(`/holidays/${id}`, data);

export const deleteHoliday = (id: string) => api.delete<ApiResponse<void>>(`/holidays/${id}`);

// ─── Weekly Rules ─────────────────────────────────────────────────────────────

export const getWeeklyHolidayRules = () =>
  api.get<ApiResponse<WeeklyHolidayRule[]>>('/holidays/weekly-rules');

export const upsertWeeklyRule = (data: {
  day_of_week: number;
  week_of_month: number | null;
  is_active: boolean;
}) => api.post<ApiResponse<WeeklyHolidayRule>>('/holidays/weekly-rules', data);

export const batchUpsertWeeklyRules = (rules: Array<{
  day_of_week: number;
  week_of_month: number | null;
  is_active: boolean;
}>) => api.post<ApiResponse<WeeklyHolidayRule[]>>('/holidays/weekly-rules/batch', { rules });

// ─── Working Days Calculator ──────────────────────────────────────────────────

export const getWorkingDays = (start_date: string, end_date: string) =>
  api.get<ApiResponse<{ working_days: number }>>('/holidays/working-days', {
    params: { start_date, end_date },
  });
