import { api } from './api.js';
import type { ApiResponse, WorkShift, CreateShiftDTO, UpdateShiftDTO } from '@workforce/shared';

export const getShifts = () => api.get<ApiResponse<WorkShift[]>>('/shifts');

export const getCurrentShift = () => api.get<ApiResponse<WorkShift>>('/shifts/current');

export const getShiftById = (id: string) => api.get<ApiResponse<WorkShift>>(`/shifts/${id}`);

export const createShift = (data: CreateShiftDTO) =>
  api.post<ApiResponse<WorkShift>>('/shifts', data);

export const updateShift = (id: string, data: UpdateShiftDTO) =>
  api.put<ApiResponse<WorkShift>>(`/shifts/${id}`, data);

export const deleteShift = (id: string) =>
  api.delete<ApiResponse<{ deleted: boolean }>>(`/shifts/${id}`);
