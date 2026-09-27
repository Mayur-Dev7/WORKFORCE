import { api } from './api.js';
import type { ApiResponse, LeaveRequest, LeaveBalance, LeaveType } from '@workforce/shared';

// ─── My Leave (Employee) ──────────────────────────────────────────────────────

export const getMyLeaveRequests = (params?: {
  year?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) => api.get<ApiResponse<LeaveRequest[]>>('/leave/my/requests', { params });

export const applyLeave = (data: {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}) => api.post<ApiResponse<LeaveRequest>>('/leave/my/requests', data);

export const cancelMyLeaveRequest = (id: string) =>
  api.delete<ApiResponse<void>>(`/leave/my/requests/${id}`);

export const getMyLeaveBalances = (year?: number) =>
  api.get<ApiResponse<LeaveBalance[]>>('/leave/my/balances', { params: { year } });

// ─── Admin Leave ──────────────────────────────────────────────────────────────

export const getAllLeaveRequests = (params?: {
  year?: number;
  status?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
}) => api.get<ApiResponse<LeaveRequest[]>>('/leave/requests', { params });

export const reviewLeaveRequest = (
  id: string,
  data: { action: 'APPROVE' | 'REJECT'; reviewer_note?: string }
) => api.post<ApiResponse<LeaveRequest>>(`/leave/requests/${id}/review`, data);

// ─── Leave Types ──────────────────────────────────────────────────────────────

export const getLeaveTypes = () => api.get<ApiResponse<LeaveType[]>>('/leave/types');

export const createLeaveType = (data: {
  code: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
}) => api.post<ApiResponse<LeaveType>>('/leave/types', data);

export const updateLeaveType = (
  id: string,
  data: Partial<{ name: string; annual_quota: number; is_paid: boolean; is_active: boolean }>
) => api.patch<ApiResponse<LeaveType>>(`/leave/types/${id}`, data);

// ─── Leave Balances (Admin) ───────────────────────────────────────────────────

export const getAllLeaveBalances = (year?: number) =>
  api.get<ApiResponse<LeaveBalance[]>>('/leave/balances', { params: { year } });

export const allocateLeaveBalance = (data: {
  user_id: string;
  leave_type_id: string;
  leave_year: number;
  allocated_days: number;
}) => api.post<ApiResponse<LeaveBalance>>('/leave/balances/allocate', data);

export const initializeLeaveYear = (year: number) =>
  api.post<ApiResponse<void>>('/leave/balances/initialize-year', { year });
