import { officesRepository, OfficeRow } from '../repositories/offices.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { withTransaction } from '../lib/db.js';
import { Office, AuditAction, ErrorCode } from '@workforce/shared';

function mapRowToOffice(row: OfficeRow): Office {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    radius_meters: row.radius_meters,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    employee_count: row.employee_count,
  };
}

export class OfficesService {
  async getAll(companyId?: string): Promise<Office[]> {
    const rows = await officesRepository.findAll(companyId);
    return rows.map(mapRowToOffice);
  }

  async getById(id: string): Promise<Office | null> {
    const row = await officesRepository.findById(id);
    return row ? mapRowToOffice(row) : null;
  }

  async create(
    actorUserId: string,
    data: {
      company_id: string;
      name: string;
      address?: string | null;
      latitude: number;
      longitude: number;
      radius_meters?: number;
      apply_to_all_employees?: boolean;
    }
  ): Promise<Office> {
    return withTransaction(async (client) => {
      const officeRow = await officesRepository.create(data, client);
      let affectedCount = 0;

      if (data.apply_to_all_employees) {
        affectedCount = await usersRepository.updateOfficeForAllInCompany(
          data.company_id,
          officeRow.id,
          client
        );
      }

      await auditLogsRepository.create(
        {
          actor_user_id: actorUserId,
          action: AuditAction.OFFICE_CREATED,
          entity_type: 'office',
          entity_id: officeRow.id,
          metadata: {
            name: officeRow.name,
            radiusMeters: officeRow.radius_meters,
            appliedToAllEmployees: !!data.apply_to_all_employees,
            affectedEmployees: affectedCount,
          },
        },
        client
      );

      const refreshed = await officesRepository.findById(officeRow.id, client);
      return mapRowToOffice(refreshed || officeRow);
    });
  }

  async update(
    actorUserId: string,
    id: string,
    data: {
      name?: string;
      address?: string | null;
      latitude?: number;
      longitude?: number;
      radius_meters?: number;
      is_active?: boolean;
      apply_to_all_employees?: boolean;
    }
  ): Promise<Office> {
    return withTransaction(async (client) => {
      const officeRow = await officesRepository.update(id, data, client);
      if (!officeRow) {
        const err = new Error('Office not found');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }

      let affectedCount = 0;
      if (data.apply_to_all_employees) {
        affectedCount = await usersRepository.updateOfficeForAllInCompany(
          officeRow.company_id,
          id,
          client
        );
      }

      await auditLogsRepository.create(
        {
          actor_user_id: actorUserId,
          action: data.is_active === false ? AuditAction.OFFICE_DISABLED : AuditAction.OFFICE_UPDATED,
          entity_type: 'office',
          entity_id: id,
          metadata: {
            ...data,
            appliedToAllEmployees: !!data.apply_to_all_employees,
            affectedEmployees: affectedCount,
          },
        },
        client
      );

      const refreshed = await officesRepository.findById(id, client);
      return mapRowToOffice(refreshed || officeRow);
    });
  }

  async applyToAllCompanyEmployees(
    actorUserId: string,
    companyId: string,
    officeId: string
  ): Promise<{ affectedEmployees: number }> {
    return withTransaction(async (client) => {
      const office = await officesRepository.findById(officeId, client);
      if (!office) {
        const err = new Error('Office not found');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }

      const affectedEmployees = await usersRepository.updateOfficeForAllInCompany(
        companyId,
        officeId,
        client
      );

      await auditLogsRepository.create(
        {
          actor_user_id: actorUserId,
          action: AuditAction.USER_UPDATED,
          entity_type: 'office',
          entity_id: officeId,
          metadata: {
            assignedOfficeToAllEmployees: true,
            officeName: office.name,
            affectedEmployees,
          },
        },
        client
      );

      return { affectedEmployees };
    });
  }
}

export const officesService = new OfficesService();
