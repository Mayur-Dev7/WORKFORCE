import { shiftsRepository } from '../repositories/shifts.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { WorkShift, CreateShiftDTO, UpdateShiftDTO, AuditAction } from '@workforce/shared';

export class ShiftsService {
  async getAll(companyId: string): Promise<WorkShift[]> {
    return shiftsRepository.findAll(companyId);
  }

  async getById(id: string): Promise<WorkShift | null> {
    return shiftsRepository.findById(id);
  }

  async getCurrentShiftForUser(companyId: string, officeId?: string | null): Promise<WorkShift> {
    const shift = await shiftsRepository.findByOfficeOrCompanyDefault(companyId, officeId);
    if (shift) return shift;

    // Fallback: standard 8-hour shift default
    return {
      id: 'default-fallback',
      company_id: companyId,
      office_id: officeId || null,
      name: 'Standard 8-Hour Shift',
      start_time: '09:00',
      end_time: '17:00',
      total_hours: 8.0,
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      breaks: [
        {
          name: 'Lunch Break',
          start_time: '13:00',
          end_time: '14:00',
          duration_minutes: 60,
          is_paid: false,
        },
      ],
    };
  }

  async create(actorUserId: string, companyId: string, data: CreateShiftDTO): Promise<WorkShift> {
    const shift = await shiftsRepository.create({
      company_id: companyId,
      office_id: data.office_id || null,
      name: data.name,
      start_time: data.start_time,
      end_time: data.end_time,
      total_hours: data.total_hours,
      is_default: data.is_default,
      breaks: data.breaks,
    });

    await auditLogsRepository.create({
      actor_user_id: actorUserId,
      action: AuditAction.SHIFT_CREATED,
      entity_type: 'WORK_SHIFT',
      entity_id: shift.id,
      metadata: {
        name: shift.name,
        office_id: shift.office_id,
        total_hours: shift.total_hours,
        breaks_count: shift.breaks?.length || 0,
      },
    });

    return shift;
  }

  async update(actorUserId: string, id: string, data: UpdateShiftDTO): Promise<WorkShift | null> {
    const updated = await shiftsRepository.update(id, data);
    if (!updated) return null;

    await auditLogsRepository.create({
      actor_user_id: actorUserId,
      action: AuditAction.SHIFT_UPDATED,
      entity_type: 'WORK_SHIFT',
      entity_id: id,
      metadata: {
        name: updated.name,
        total_hours: updated.total_hours,
        breaks_count: updated.breaks?.length || 0,
      },
    });

    return updated;
  }

  async delete(actorUserId: string, id: string): Promise<boolean> {
    const existing = await shiftsRepository.findById(id);
    if (!existing) return false;

    const deleted = await shiftsRepository.delete(id);
    if (deleted) {
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.SHIFT_DELETED,
        entity_type: 'WORK_SHIFT',
        entity_id: id,
        metadata: {
          name: existing.name,
          office_id: existing.office_id,
        },
      });
    }
    return deleted;
  }
}

export const shiftsService = new ShiftsService();
