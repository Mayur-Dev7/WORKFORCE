import { attendanceRepository } from '../repositories/attendance.repository.js';
import { AttendanceReportItem } from '@workforce/shared';

export interface ReportFilterOptions {
  startDate?: string;
  endDate?: string;
  officeId?: string;
  departmentId?: string;
  userId?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'ALL';
}

export class ReportsService {
  async getAttendanceReport(companyId: string, filters: ReportFilterOptions): Promise<AttendanceReportItem[]> {
    return attendanceRepository.getReportData({ ...filters, companyId });
  }

  async getAdminStats(companyId: string) {
    return attendanceRepository.getAdminStats(companyId);
  }

  generateCsv(items: AttendanceReportItem[]): string {
    const headers = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Office',
      'Check In Time',
      'Check Out Time',
      'Duration (Minutes)',
      'Check In Distance (Meters)',
      'Face Similarity',
      'Status',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = items.map((item) => [
      escapeCsv(item.employee_code),
      escapeCsv(item.employee_name),
      escapeCsv(item.department_name),
      escapeCsv(item.office_name),
      escapeCsv(item.check_in_at),
      escapeCsv(item.check_out_at || 'In Session'),
      escapeCsv(item.duration_minutes !== null ? item.duration_minutes : 'N/A'),
      escapeCsv(item.check_in_distance_meters),
      escapeCsv(item.check_in_face_similarity),
      escapeCsv(item.status),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const reportsService = new ReportsService();
