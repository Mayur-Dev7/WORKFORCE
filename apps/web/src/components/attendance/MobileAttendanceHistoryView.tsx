import React, { useState, useMemo } from 'react';
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  DownOutlined,
  UpOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Modal, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { AttendanceSession, LeaveRequest, Holiday } from '@workforce/shared';

export interface MobileCalendarDay {
  dayNum: number;
  date: Dayjs;
  isToday: boolean;
  isFuture: boolean;
  isWeekend: boolean;
  isLeave: boolean;
  leaveDetails?: LeaveRequest;
  isHoliday: boolean;
  holidayDetails?: Holiday;
  isAbsent: boolean;
  durationMinutes: number;
  badgeTextDesktop: string;
  badgeTextMobile: string;
  statusClass: 'full' | 'short' | 'leave' | 'holiday' | 'weekend' | 'absent' | 'future';
  timeRangeText?: string;
  daySessions: AttendanceSession[];
}

export interface MobileAttendanceHistoryProps {
  selectedMonth: Dayjs;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectMonth: (month: Dayjs) => void;
  metrics: {
    totalHoursFormatted: string;
    presentDaysCount: number;
    leaveDaysCount: number;
    holidayDaysCount: number;
    absentDaysCount: number;
    avgDailyHoursFormatted: string;
  };
  startOffset: number;
  days: MobileCalendarDay[];
  sessions: AttendanceSession[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const MobileAttendanceHistoryView: React.FC<MobileAttendanceHistoryProps> = ({
  selectedMonth,
  onPrevMonth,
  onNextMonth,
  onSelectMonth,
  metrics,
  startOffset,
  days,
  sessions,
  loading,
  error,
  onRetry,
}) => {
  // Calendar vs List view toggle
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  // Currently selected date for inline details
  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => {
    const today = dayjs().startOf('day');
    if (selectedMonth.isSame(today, 'month')) {
      return today;
    }
    return selectedMonth.date(1);
  });

  // Track if user explicitly opened progressive disclosure
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Status meanings modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  // Month picker dropdown toggle
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // When selectedMonth changes, update selectedDate to 1st of month (or today if current month)
  React.useEffect(() => {
    const today = dayjs().startOf('day');
    if (selectedMonth.isSame(today, 'month')) {
      setSelectedDate(today);
    } else {
      setSelectedDate(selectedMonth.date(1));
    }
    setShowTechnicalDetails(false);
  }, [selectedMonth]);

  // Find day object for currently selected date
  const activeDay = useMemo(() => {
    return days.find((d) => d.date.isSame(selectedDate, 'day')) || null;
  }, [days, selectedDate]);

  return (
    <div className="apple-mobile-history">
      {/* ─── Month Navigation & Segmented Control ─── */}
      <div className="apple-mobile-history-topbar">
        {/* Month Navigation */}
        <div className="apple-mobile-month-nav">
          <button
            type="button"
            className="apple-mobile-month-btn"
            onClick={onPrevMonth}
            aria-label="Previous month"
          >
            <LeftOutlined style={{ fontSize: 12 }} />
          </button>

          <button
            type="button"
            className="apple-mobile-month-title"
            onClick={() => setMonthPickerOpen(true)}
            aria-label="Select month"
          >
            <span>{selectedMonth.format('MMMM YYYY')}</span>
            <DownOutlined style={{ fontSize: 10, color: 'var(--apple-text-tertiary)' }} />
          </button>

          <button
            type="button"
            className="apple-mobile-month-btn"
            onClick={onNextMonth}
            aria-label="Next month"
          >
            <RightOutlined style={{ fontSize: 12 }} />
          </button>

          {/* Hidden DatePicker popover anchor */}
          <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
            <DatePicker
              picker="month"
              open={monthPickerOpen}
              value={selectedMonth}
              onChange={(val) => {
                if (val) onSelectMonth(val);
                setMonthPickerOpen(false);
              }}
              onOpenChange={(open) => setMonthPickerOpen(open)}
            />
          </div>
        </div>

        {/* Calendar | List Segmented Toggle */}
        <div className="apple-mobile-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            className={`apple-mobile-seg-item ${viewMode === 'calendar' ? 'is-active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`apple-mobile-seg-item ${viewMode === 'list' ? 'is-active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
      </div>

      {/* ─── Inline Error Banner ─── */}
      {error && (
        <div className="apple-mobile-history-error">
          <span>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="apple-mobile-retry-btn">
              Try again
            </button>
          )}
        </div>
      )}

      {/* ─── Monthly Summary Surface (Apple HIG Typography & Spacing) ─── */}
      <div className="apple-mobile-summary-surface">
        <div className="apple-mobile-summary-header">
          <span className="apple-mobile-summary-title">Summary</span>
          <span className="apple-mobile-summary-sub">{selectedMonth.format('MMMM YYYY')}</span>
        </div>

        <div className="apple-mobile-summary-grid">
          <div className="apple-mobile-summary-item">
            <span className="apple-mobile-summary-label">Working time</span>
            <span className="apple-mobile-summary-value">{metrics.totalHoursFormatted}</span>
          </div>

          <div className="apple-mobile-summary-item">
            <span className="apple-mobile-summary-label">Present</span>
            <span className="apple-mobile-summary-value">
              {metrics.presentDaysCount} {metrics.presentDaysCount === 1 ? 'day' : 'days'}
            </span>
          </div>

          <div className="apple-mobile-summary-item">
            <span className="apple-mobile-summary-label">Leave</span>
            <span className="apple-mobile-summary-value">
              {metrics.leaveDaysCount} {metrics.leaveDaysCount === 1 ? 'day' : 'days'}
            </span>
          </div>

          <div className="apple-mobile-summary-item">
            <span className="apple-mobile-summary-label">Holidays</span>
            <span className="apple-mobile-summary-value">{metrics.holidayDaysCount}</span>
          </div>
        </div>
      </div>

      {/* ─── Primary Content: Calendar View ─── */}
      {viewMode === 'calendar' && (
        <div className="apple-mobile-calendar-surface">
          {/* Weekday Labels Header */}
          <div className="apple-mobile-calendar-weekdays">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w) => (
              <span key={w} className="apple-mobile-weekday-col">
                {w}
              </span>
            ))}
          </div>

          {/* 7-Column Day Grid */}
          <div className="apple-mobile-calendar-grid">
            {/* Leading spacer slots for days before 1st of month */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`spacer-${i}`} className="apple-mobile-day-slot is-empty" />
            ))}

            {/* Calendar Days */}
            {days.map((d) => {
              const isSelected = selectedDate.isSame(d.date, 'day');
              const cellClasses = [
                'apple-mobile-day-slot',
                isSelected ? 'is-selected' : '',
                d.isToday ? 'is-today' : '',
                d.isFuture ? 'is-future' : '',
                d.isWeekend ? 'is-weekend' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  type="button"
                  key={d.dayNum}
                  className={cellClasses}
                  onClick={() => {
                    setSelectedDate(d.date);
                    setShowTechnicalDetails(false);
                  }}
                  aria-label={`${d.date.format('MMMM D, YYYY')}, ${d.badgeTextMobile || 'No record'}`}
                  aria-pressed={isSelected}
                >
                  <span className="apple-mobile-day-num">{d.dayNum}</span>

                  {/* Attendance State Indicator (Quiet & Semantic) */}
                  <div className="apple-mobile-day-indicator">
                    {d.isFuture ? (
                      <span className="apple-mobile-dot dot-future" />
                    ) : d.statusClass === 'full' ? (
                      <>
                        <span className="apple-mobile-dot dot-present" />
                        <span className="apple-mobile-indicator-text">{d.badgeTextMobile}</span>
                      </>
                    ) : d.statusClass === 'short' ? (
                      <>
                        <span className="apple-mobile-dot dot-short" />
                        <span className="apple-mobile-indicator-text">{d.badgeTextMobile}</span>
                      </>
                    ) : d.statusClass === 'leave' ? (
                      <>
                        <span className="apple-mobile-dot dot-leave" />
                        <span className="apple-mobile-indicator-text">Leave</span>
                      </>
                    ) : d.statusClass === 'holiday' ? (
                      <>
                        <span className="apple-mobile-dot dot-holiday" />
                        <span className="apple-mobile-indicator-text">Holi</span>
                      </>
                    ) : d.statusClass === 'weekend' ? (
                      <span className="apple-mobile-indicator-text text-muted">Off</span>
                    ) : d.isAbsent ? (
                      <span className="apple-mobile-dot dot-absent" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Compact Legend Trigger */}
          <div className="apple-mobile-legend-row">
            <button
              type="button"
              className="apple-mobile-legend-btn"
              onClick={() => setStatusModalOpen(true)}
            >
              <InfoCircleOutlined style={{ fontSize: 13 }} />
              <span>Status meanings ›</span>
            </button>
          </div>

          {/* ─── Selected Day Detail Section (Inline Surface) ─── */}
          {activeDay && (
            <div className="apple-mobile-day-detail-surface">
              <div className="apple-mobile-day-detail-header">
                <div>
                  <h3 className="apple-mobile-day-detail-title">
                    {activeDay.date.format('dddd, MMMM D')}
                  </h3>
                  <div className="apple-mobile-day-detail-sub">
                    {activeDay.daySessions.length > 0 ? (
                      <span>
                        {activeDay.durationMinutes > 0
                          ? `${activeDay.durationMinutes} min worked`
                          : 'Logged session'}
                        {' · '}
                        <strong style={{ color: activeDay.statusClass === 'full' ? '#16a34a' : '#d97706' }}>
                          {activeDay.statusClass === 'full' ? 'Full day' : 'Short hours'}
                        </strong>
                      </span>
                    ) : activeDay.isLeave ? (
                      <span style={{ color: '#2563eb' }}>
                        Approved Leave · {activeDay.leaveDetails?.leave_type_name || 'Leave'}
                      </span>
                    ) : activeDay.isHoliday ? (
                      <span style={{ color: '#9333ea' }}>
                        Holiday · {activeDay.holidayDetails?.name || 'Official Holiday'}
                      </span>
                    ) : activeDay.isWeekend ? (
                      <span style={{ color: '#64748b' }}>Weekly Off</span>
                    ) : activeDay.isFuture ? (
                      <span style={{ color: '#94a3b8' }}>Upcoming work day</span>
                    ) : (
                      <span style={{ color: '#dc2626' }}>No punch recorded</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Day Punch Content */}
              {activeDay.daySessions.length > 0 ? (
                <div className="apple-mobile-day-sessions">
                  {activeDay.daySessions.map((session, idx) => {
                    const matchPct = Math.round((session.check_in_face_similarity || 0) * 100);
                    const livenessPct = session.check_in_liveness_score
                      ? Math.round(session.check_in_liveness_score * 100)
                      : null;
                    const distanceM = Math.round(session.check_in_distance_meters || 0);
                    const accuracyM = session.check_in_accuracy_meters
                      ? Math.round(session.check_in_accuracy_meters)
                      : null;

                    return (
                      <div key={session.id || idx} className="apple-mobile-session-card">
                        {activeDay.daySessions.length > 1 && (
                          <div className="apple-mobile-session-index">
                            Punch #{idx + 1}
                          </div>
                        )}

                        <div className="apple-mobile-row-list">
                          <div className="apple-mobile-row-item">
                            <span className="apple-mobile-row-label">Check-in</span>
                            <span className="apple-mobile-row-val font-semibold">
                              {dayjs(session.check_in_at).format('hh:mm A')}
                            </span>
                          </div>

                          <div className="apple-mobile-row-item">
                            <span className="apple-mobile-row-label">Check-out</span>
                            <span className="apple-mobile-row-val font-semibold">
                              {session.check_out_at
                                ? dayjs(session.check_out_at).format('hh:mm A')
                                : 'Not recorded'}
                            </span>
                          </div>

                          <div className="apple-mobile-row-item">
                            <span className="apple-mobile-row-label">Face verification</span>
                            <span className="apple-mobile-row-val text-success">
                              <CheckCircleFilled style={{ fontSize: 12, marginRight: 4 }} />
                              Verified
                            </span>
                          </div>

                          <div className="apple-mobile-row-item">
                            <span className="apple-mobile-row-label">Office location</span>
                            <span className="apple-mobile-row-val text-success">
                              <CheckCircleFilled style={{ fontSize: 12, marginRight: 4 }} />
                              Inside boundary
                            </span>
                          </div>
                        </div>

                        {/* Progressive Disclosure Toggle */}
                        <div className="apple-mobile-disclosure-wrapper">
                          <button
                            type="button"
                            className="apple-mobile-disclosure-btn"
                            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                            aria-expanded={showTechnicalDetails}
                          >
                            <span>Attendance details</span>
                            {showTechnicalDetails ? (
                              <UpOutlined style={{ fontSize: 10 }} />
                            ) : (
                              <DownOutlined style={{ fontSize: 10 }} />
                            )}
                          </button>

                          {showTechnicalDetails && (
                            <div className="apple-mobile-disclosure-content">
                              <div className="apple-mobile-detail-grid">
                                <div className="apple-mobile-detail-col">
                                  <span className="apple-mobile-detail-label">Face match</span>
                                  <span className="apple-mobile-detail-val">{matchPct}%</span>
                                </div>
                                <div className="apple-mobile-detail-col">
                                  <span className="apple-mobile-detail-label">Liveness</span>
                                  <span className="apple-mobile-detail-val">
                                    {livenessPct ? `${livenessPct}%` : 'Verified'}
                                  </span>
                                </div>
                                <div className="apple-mobile-detail-col">
                                  <span className="apple-mobile-detail-label">GPS accuracy</span>
                                  <span className="apple-mobile-detail-val">
                                    {accuracyM ? `±${accuracyM} m` : 'Standard'}
                                  </span>
                                </div>
                                <div className="apple-mobile-detail-col">
                                  <span className="apple-mobile-detail-label">Distance</span>
                                  <span className="apple-mobile-detail-val">{distanceM} m</span>
                                </div>
                                <div className="apple-mobile-detail-col full-width">
                                  <span className="apple-mobile-detail-label">Office & Geofence</span>
                                  <span className="apple-mobile-detail-val">
                                    {session.office_name || 'Office'} · Inside boundary
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : activeDay.isLeave && activeDay.leaveDetails ? (
                <div className="apple-mobile-inline-note note-leave">
                  <div className="note-title">Leave Request Details</div>
                  <div className="note-body">
                    <div>
                      <strong>Type:</strong> {activeDay.leaveDetails.leave_type_name}
                    </div>
                    {activeDay.leaveDetails.reason && (
                      <div style={{ marginTop: 2 }}>
                        <strong>Reason:</strong> {activeDay.leaveDetails.reason}
                      </div>
                    )}
                  </div>
                </div>
              ) : activeDay.isHoliday && activeDay.holidayDetails ? (
                <div className="apple-mobile-inline-note note-holiday">
                  <div className="note-title">Corporate Holiday</div>
                  <div className="note-body">
                    <div>{activeDay.holidayDetails.name}</div>
                    {activeDay.holidayDetails.description && (
                      <div className="note-desc">{activeDay.holidayDetails.description}</div>
                    )}
                  </div>
                </div>
              ) : activeDay.isWeekend ? (
                <div className="apple-mobile-inline-empty">
                  <span>Scheduled weekly rest day</span>
                </div>
              ) : activeDay.isFuture ? (
                <div className="apple-mobile-inline-empty">
                  <span>Upcoming working day</span>
                </div>
              ) : (
                <div className="apple-mobile-inline-empty">
                  <span>No attendance punches recorded for this day</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── List View (Clean Chronological Punch History) ─── */}
      {viewMode === 'list' && (
        <div className="apple-mobile-list-surface">
          {sessions.length === 0 ? (
            <div className="apple-mobile-empty-state">
              <ScheduleOutlined style={{ fontSize: 32, color: 'var(--apple-text-tertiary)', marginBottom: 8 }} />
              <div className="empty-title">No attendance records</div>
              <div className="empty-desc">Your attendance for this month will appear here.</div>
            </div>
          ) : (
            <div className="apple-mobile-session-list">
              {sessions.map((session) => {
                const start = dayjs(session.check_in_at);
                const end = session.check_out_at ? dayjs(session.check_out_at) : null;
                const diffMins = end ? Math.max(0, end.diff(start, 'minute')) : null;
                const durationFormatted = diffMins !== null
                  ? `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
                  : 'Currently Active';

                return (
                  <div key={session.id} className="apple-mobile-list-card">
                    <div className="apple-mobile-list-header">
                      <div className="list-date">{start.format('dddd, MMM D')}</div>
                      <div className={`list-duration ${diffMins !== null && diffMins >= 480 ? 'tag-green' : 'tag-amber'}`}>
                        {durationFormatted}
                      </div>
                    </div>

                    <div className="apple-mobile-list-body">
                      <div className="list-time-row">
                        <span className="time-item">
                          <span className="label">In:</span> {start.format('hh:mm A')}
                        </span>
                        <span className="time-item">
                          <span className="label">Out:</span>{' '}
                          {end ? end.format('hh:mm A') : 'Active'}
                        </span>
                      </div>

                      <div className="list-meta-row">
                        <span>
                          <EnvironmentOutlined style={{ fontSize: 11, marginRight: 4 }} />
                          {session.office_name || 'Assigned Office'}
                        </span>
                        <span>
                          <SafetyCertificateOutlined style={{ fontSize: 11, marginRight: 4, color: '#16a34a' }} />
                          {Math.round((session.check_in_face_similarity || 0) * 100)}% match
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Status Meanings Modal ─── */}
      <Modal
        title="Status Meanings"
        open={statusModalOpen}
        onCancel={() => setStatusModalOpen(false)}
        footer={null}
        centered
        width={360}
      >
        <div className="apple-mobile-status-modal-content">
          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-present" />
            <div className="status-text">
              <strong>Present</strong>
              <p>Full working day with attendance ≥ 8 hours</p>
            </div>
          </div>

          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-short" />
            <div className="status-text">
              <strong>Short Hours</strong>
              <p>Attendance logged under 8 hours</p>
            </div>
          </div>

          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-leave" />
            <div className="status-text">
              <strong>On Leave</strong>
              <p>Approved leave of absence</p>
            </div>
          </div>

          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-holiday" />
            <div className="status-text">
              <strong>Corporate Holiday</strong>
              <p>Official company holiday</p>
            </div>
          </div>

          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-off" />
            <div className="status-text">
              <strong>Weekly Off</strong>
              <p>Scheduled weekend or rest day</p>
            </div>
          </div>

          <div className="apple-mobile-status-row">
            <span className="apple-mobile-dot dot-absent" />
            <div className="status-text">
              <strong>No Punch Recorded</strong>
              <p>Past working day with no attendance logged</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
