/**
 * holidayResolver.ts
 *
 * Pure functions — NO database access allowed here.
 * HolidayService fetches data from DB, then passes it into these functions.
 * This makes calendar logic deterministic and independently testable.
 */

import type { Holiday, WeeklyHolidayRule } from '@workforce/shared';

/**
 * Returns whether a given JS Date is a holiday based on
 * fixed holiday list and weekly holiday rules.
 *
 * @param date        The date to evaluate (time portion is ignored)
 * @param holidays    Active holidays for the relevant company/office
 * @param weeklyRules Active weekly holiday rules for the company
 */
export function isHoliday(
  date: Date,
  holidays: Holiday[],
  weeklyRules: WeeklyHolidayRule[]
): boolean {
  return isFixedHoliday(date, holidays) || isWeeklyHoliday(date, weeklyRules);
}

/**
 * Returns true if date matches any active fixed/recurring holiday.
 */
export function isFixedHoliday(date: Date, holidays: Holiday[]): boolean {
  const month = date.getUTCMonth() + 1; // 1-based
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();

  for (const h of holidays) {
    if (!h.is_active) continue;

    const hDate = new Date(h.holiday_date + 'T00:00:00Z');
    const hMonth = hDate.getUTCMonth() + 1;
    const hDay = hDate.getUTCDate();
    const hYear = hDate.getUTCFullYear();

    if (h.is_recurring) {
      // recurring: match month+day regardless of year
      if (hMonth === month && hDay === day) return true;
    } else {
      // non-recurring: exact year+month+day match
      if (hYear === year && hMonth === month && hDay === day) return true;
    }
  }
  return false;
}

/**
 * Returns true if date falls on a weekly holiday (e.g. every Sunday, 2nd Saturday).
 *
 * day_of_week uses JS convention: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 * week_of_month NULL means every occurrence of that weekday.
 */
export function isWeeklyHoliday(date: Date, rules: WeeklyHolidayRule[]): boolean {
  const dow = date.getUTCDay(); // 0=Sun … 6=Sat

  // Corporate default fallback: if no weekly rules are configured for the company,
  // Sunday (dow === 0) is treated as the standard non-working day.
  if (!rules || rules.length === 0) {
    return dow === 0;
  }

  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.day_of_week !== dow) continue;

    if (rule.week_of_month === null) {
      // Every occurrence of this weekday is a holiday
      return true;
    }

    // Check which occurrence of this weekday this date is within its month
    const occurrence = nthWeekdayOccurrence(date);
    if (occurrence === rule.week_of_month) return true;
  }
  return false;
}

/**
 * Returns which (1-based) occurrence of its weekday a date is within the month.
 * E.g. the 2nd Saturday in March → returns 2.
 */
export function nthWeekdayOccurrence(date: Date): number {
  const dayOfMonth = date.getUTCDate();
  // integer ceil of (dayOfMonth / 7)
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Counts working days between startDate and endDate (both inclusive).
 * A working day is a day that is neither a fixed holiday nor a weekly holiday.
 *
 * All dates are treated as UTC to avoid timezone shifts.
 */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  holidays: Holiday[],
  weeklyRules: WeeklyHolidayRule[]
): number {
  if (endDate < startDate) return 0;

  let count = 0;
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  );

  while (cursor <= end) {
    if (!isHoliday(cursor, holidays, weeklyRules)) {
      count++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

/**
 * Returns all dates (as UTC Date objects) in [startDate, endDate] that are working days.
 */
export function listWorkingDays(
  startDate: Date,
  endDate: Date,
  holidays: Holiday[],
  weeklyRules: WeeklyHolidayRule[]
): Date[] {
  const result: Date[] = [];
  if (endDate < startDate) return result;

  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  );

  while (cursor <= end) {
    if (!isHoliday(cursor, holidays, weeklyRules)) {
      result.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
