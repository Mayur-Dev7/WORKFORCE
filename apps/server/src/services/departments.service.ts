import { departmentsRepository, DepartmentRow } from '../repositories/departments.repository.js';
import { Department } from '@workforce/shared';

function mapRowToDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    created_at: row.created_at.toISOString(),
    employee_count: row.employee_count,
  };
}

export class DepartmentsService {
  async getAll(companyId?: string): Promise<Department[]> {
    const rows = await departmentsRepository.findAll(companyId);
    return rows.map(mapRowToDepartment);
  }

  async getById(id: string): Promise<Department | null> {
    const row = await departmentsRepository.findById(id);
    return row ? mapRowToDepartment(row) : null;
  }

  async create(data: { company_id: string; name: string }): Promise<Department> {
    const row = await departmentsRepository.create(data);
    return mapRowToDepartment(row);
  }

  async update(id: string, name: string, companyId?: string): Promise<Department | null> {
    const row = await departmentsRepository.update(id, { name }, undefined, companyId);
    return row ? mapRowToDepartment(row) : null;
  }
}

export const departmentsService = new DepartmentsService();
