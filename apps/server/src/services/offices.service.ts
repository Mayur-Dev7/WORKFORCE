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

  async getById(id: string, companyId?: string): Promise<Office | null> {
    const row = await officesRepository.findById(id, undefined, companyId);
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
    },
    companyId?: string
  ): Promise<Office> {
    return withTransaction(async (client) => {
      const officeRow = await officesRepository.update(id, data, client, companyId);
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
          company_id: officeRow.company_id,
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

      const refreshed = await officesRepository.findById(id, client, companyId);
      return mapRowToOffice(refreshed || officeRow);
    });
  }

  async applyToAllCompanyEmployees(
    actorUserId: string,
    companyId: string,
    officeId: string
  ): Promise<{ affectedEmployees: number }> {
    return withTransaction(async (client) => {
      const office = await officesRepository.findById(officeId, client, companyId);
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
          company_id: companyId,
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

  async delete(actorUserId: string, id: string, companyId?: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const office = await officesRepository.findById(id, client, companyId);
      if (!office) {
        const err = new Error('Office not found');
        (err as any).statusCode = 404;
        throw err;
      }

      if (office.employee_count && office.employee_count > 0) {
        const err = new Error(
          `Cannot delete "${office.name}" because ${office.employee_count} employee(s) are assigned to it. Please reassign them to another office first.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // Clean up any attendance sessions or holidays associated with this office
      await client.query(`DELETE FROM attendance_sessions WHERE office_id = $1`, [id]);
      await client.query(`DELETE FROM holidays WHERE office_id = $1`, [id]);

      const deleted = await officesRepository.delete(id, client, companyId);

      await auditLogsRepository.create(
        {
          company_id: office.company_id,
          actor_user_id: actorUserId,
          action: AuditAction.OFFICE_DELETED,
          entity_type: 'office',
          entity_id: id,
          metadata: {
            name: office.name,
            address: office.address,
            latitude: office.latitude,
            longitude: office.longitude,
          },
        },
        client
      );

      return deleted;
    });
  }
}

export const officesService = new OfficesService();
