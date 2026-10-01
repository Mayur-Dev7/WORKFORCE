import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  message,
  Empty,
  Pagination,
  Drawer,
  DatePicker,
  Tabs,
  Badge,
  Tooltip,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  HistoryOutlined,
  AppstoreOutlined,
  ScheduleOutlined,
  ExclamationCircleOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { AttendanceSession, ApiResponse, LeaveRequest, Holiday, WeeklyHolidayRule } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { getMyLeaveRequests } from '../../services/leave.api.js';
import { getHolidays, getWeeklyHolidayRules } from '../../services/holidays.api.js';
import { MobileAttendanceHistoryView } from '../../components/attendance/MobileAttendanceHistoryView.js';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

/** Helper to compute hours and minutes between punch times */
const getDurationText = (checkIn: string, checkOut: string | null) => {
  if (!checkOut) return 'Currently Active';
  const start = dayjs(checkIn);
  const end = dayjs(checkOut);
  const diffMins = Math.max(0, end.diff(start, 'minute'));
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs}h ${mins}m`;
};

/** Format total minutes into a clean readable string (e.g. 8h 15m) */
const formatDurationClean = (totalMins: number) => {
  if (totalMins <= 0) return '0h 0m';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

/** Mobile card representing a single attendance punch session */
const AttendanceCard: React.FC<{ session: AttendanceSession }> = ({ session }) => {
  const isActive = !session.check_out_at;
  const durationText = getDurationText(session.check_in_at, session.check_out_at);
  const matchPct = Math.round((session.check_in_face_similarity || 0) * 100);
  const livenessText = session.check_in_liveness_score
    ? `${Math.round(session.check_in_liveness_score * 100)}%`
    : 'Passed';
  const distanceMeters = Math.round(session.check_in_distance_meters || 0);

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        border: '1px solid #e2e8f0',
      }}
      styles={{ body: { padding: '14px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined style={{ color: '#1677ff', fontSize: 13 }} />
            <Text strong style={{ fontSize: 14 }}>
              {dayjs(session.check_in_at).format('dddd, MMM DD, YYYY')}
            </Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Tag color="blue" icon={<EnvironmentOutlined />} style={{ margin: 0, fontSize: 11 }}>
              {session.office_name || 'Assigned Office'}
            </Tag>
          </div>
        </div>

        <Tag
          color={isActive ? 'processing' : 'green'}
          icon={isActive ? <ClockCircleOutlined /> : <CheckCircleOutlined />}
          style={{ fontSize: 12, margin: 0, padding: '2px 8px', borderRadius: 6 }}
        >
          {durationText}
        </Tag>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          background: '#f8fafc',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '10px 0',
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHECK-IN TIME
          </Text>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
            {dayjs(session.check_in_at).format('hh:mm:ss A')}
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHECK-OUT TIME
          </Text>
          <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#1677ff' : '#0f172a', marginTop: 2 }}>
            {session.check_out_at ? dayjs(session.check_out_at).format('hh:mm:ss A') : 'Currently Active'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          paddingTop: 4,
          borderTop: '1px solid #f1f5f9',
        }}
      >
        <Space size={6} wrap>
          <Tag
            color={matchPct >= 80 ? 'green' : 'orange'}
            icon={<SafetyCertificateOutlined />}
            style={{ margin: 0, fontSize: 11 }}
          >
            Match: {matchPct}%
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Liveness: {livenessText}
          </Text>
        </Space>

        <Text type="secondary" style={{ fontSize: 11 }}>
          📍 {distanceMeters}m from office
        </Text>
      </div>
    </Card>
  );
};

export const AttendanceHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile(768);

  // Tabs: 'summary' | 'history'
  const [activeTab, setActiveTab] = useState<'summary' | 'history'>('summary');

  // Month navigation: default to current month
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().startOf('month'));

  // Live real data states
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weeklyRules, setWeeklyRules] = useState<WeeklyHolidayRule[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected Day Drawer
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    date: Dayjs;
    durationMinutes: number;
    sessions: AttendanceSession[];
    isLeave: boolean;
    leaveDetails?: LeaveRequest;
    isHoliday: boolean;
    holidayDetails?: Holiday;
    isWeekend: boolean;
    isAbsent: boolean;
    status: string;
  } | null>(null);

  // Month picker dropdown open state
  const [pickerOpen, setPickerOpen] = useState(false);

  // Mobile page for History tab
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;

  // ── Fetch Real Data (No Dummy Values) ───────────────────────────────────────
  const fetchMonthData = async () => {
    setLoading(true);
    try {
      const monthStr = selectedMonth.format('YYYY-MM');
      const yearNum = selectedMonth.year();

      const [historyRes, activeRes, leavesRes, holidaysRes, rulesRes] = await Promise.all([
        api.get<ApiResponse<AttendanceSession[]>>(`/attendance/history?month=${monthStr}&limit=500`),
        api.get<ApiResponse<AttendanceSession | null>>('/attendance/active').catch(() => ({ data: { data: null } })),
        getMyLeaveRequests({ status: 'APPROVED', year: yearNum }).catch(() => ({ data: { data: [] } })),
        getHolidays({ year: yearNum }).catch(() => ({ data: { data: [] } })),
        getWeeklyHolidayRules().catch(() => ({ data: { data: [] } })),
      ]);

      setSessions(historyRes.data.data || []);
      setActiveSession(activeRes.data.data || null);
      setApprovedLeaves(leavesRes.data.data || []);
      setHolidays(holidaysRes.data?.data || []);
      setWeeklyRules(rulesRes.data?.data || []);
    } catch {
      message.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData();
  }, [selectedMonth]);

  // Compute Real Calendar Days & Metrics
  const { startOffset, days, metrics } = useMemo(() => {
    const today = dayjs().startOf('day');
    const daysInMonth = selectedMonth.daysInMonth();
    const startDayOfWeek = selectedMonth.startOf('month').day(); // 0 = Sunday, 1 = Monday, etc.

    const daysList: Array<{
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
    }> = [];

    let totalWorkingMinutes = 0;
    let presentDaysCount = 0;
    let leaveDaysCount = 0;
    let holidayDaysCount = 0;
    let absentDaysCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = selectedMonth.date(d);
      const isToday = date.isSame(today, 'day');
      const isFuture = date.isAfter(today, 'day');
      const dayOfWeek = date.day();

      // Check weekly off rule: if rule exists in weeklyRules, check is_active. Default to Sunday (0) and Saturday (6)
      const rule = weeklyRules.find((r) => r.day_of_week === dayOfWeek);
      const isWeekend = rule ? rule.is_active : dayOfWeek === 0 || dayOfWeek === 6;

      // Check if date matches a corporate holiday
      const holiday = holidays.find((h) => dayjs(h.holiday_date).isSame(date, 'day'));
      const isHoliday = Boolean(holiday);

      // Check if user has an approved leave request on this date
      const leave = approvedLeaves.find((lr) => {
        const start = dayjs(lr.start_date).startOf('day');
        const end = dayjs(lr.end_date).endOf('day');
        return (date.isAfter(start) || date.isSame(start, 'day')) && (date.isBefore(end) || date.isSame(end, 'day'));
      });
      const isLeave = Boolean(leave);

      // Real sessions matching this date
      const daySessions = sessions.filter((s) => dayjs(s.check_in_at).isSame(date, 'day'));

      let durationMins = 0;
      let badgeTextDesktop = '';
      let badgeTextMobile = '';
      let statusClass: 'full' | 'short' | 'leave' | 'holiday' | 'weekend' | 'absent' | 'future' = 'future';
      let isAbsent = false;
      let timeRangeText: string | undefined;

      if (isFuture) {
        statusClass = 'future';
        badgeTextDesktop = isHoliday ? (holiday?.name || 'Holiday') : isWeekend ? 'Weekend' : '';
        badgeTextMobile = isHoliday ? 'Holiday' : isWeekend ? 'Off' : '';
      } else if (daySessions.length > 0) {
        // Real punches exist for this day
        presentDaysCount++;

        // Calculate duration strictly from real sessions
        for (const s of daySessions) {
          const start = dayjs(s.check_in_at);
          const end = s.check_out_at ? dayjs(s.check_out_at) : dayjs();
          durationMins += Math.max(0, end.diff(start, 'minute'));
        }
        totalWorkingMinutes += durationMins;

        // Punch interval
        const firstCheckIn = dayjs(daySessions[0].check_in_at).format('hh:mm A');
        const lastSession = daySessions[daySessions.length - 1];
        const lastCheckOut = lastSession.check_out_at ? dayjs(lastSession.check_out_at).format('hh:mm A') : 'Active';
        timeRangeText = `${firstCheckIn} - ${lastCheckOut}`;

        const hrs = Math.floor(durationMins / 60);
        const mins = durationMins % 60;
        const compactTime = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;

        // Standard: >= 8h is full day, < 8h is half/short day
        if (durationMins >= 8 * 60) {
          statusClass = 'full';
          badgeTextDesktop = formatDurationClean(durationMins);
          badgeTextMobile = compactTime;
        } else if (durationMins > 0) {
          statusClass = 'short';
          badgeTextDesktop = formatDurationClean(durationMins);
          badgeTextMobile = compactTime;
        } else {
          statusClass = 'short';
          badgeTextDesktop = 'Logged';
          badgeTextMobile = 'Logged';
        }
      } else if (isHoliday) {
        holidayDaysCount++;
        statusClass = 'holiday';
        badgeTextDesktop = holiday?.name || 'Holiday';
        badgeTextMobile = 'Holiday';
      } else if (isLeave) {
        leaveDaysCount++;
        statusClass = 'leave';
        badgeTextDesktop = leave?.leave_type_name || 'On Leave';
        badgeTextMobile = 'Leave';
      } else if (isWeekend) {
        statusClass = 'weekend';
        badgeTextDesktop = 'Weekly Off';
        badgeTextMobile = 'Off';
      } else {
        // Working day in the past with no punch
        absentDaysCount++;
        isAbsent = true;
        statusClass = 'absent';
        badgeTextDesktop = 'No Punch';
        badgeTextMobile = 'Absent';
      }

      daysList.push({
        dayNum: d,
        date,
        isToday,
        isFuture,
        isWeekend,
        isLeave,
        leaveDetails: leave,
        isHoliday,
        holidayDetails: holiday,
        isAbsent,
        durationMinutes: durationMins,
        badgeTextDesktop,
        badgeTextMobile,
        statusClass,
        timeRangeText,
        daySessions,
      });
    }

    const totalHours = Math.floor(totalWorkingMinutes / 60);
    const totalRemainingMins = totalWorkingMinutes % 60;
    const avgDailyMins = presentDaysCount > 0 ? Math.round(totalWorkingMinutes / presentDaysCount) : 0;

    return {
      startOffset: startDayOfWeek,
      days: daysList,
      metrics: {
        totalHoursFormatted: `${totalHours}h ${totalRemainingMins}m`,
        presentDaysCount,
        leaveDaysCount,
        holidayDaysCount,
        absentDaysCount,
        avgDailyHoursFormatted: formatDurationClean(avgDailyMins),
      },
    };
  }, [selectedMonth, sessions, approvedLeaves, holidays, weeklyRules]);

  // Handle day click for inspecting punch breakdown
  const handleDayClick = (dayData: (typeof days)[0]) => {
    setSelectedDayInfo({
      date: dayData.date,
      durationMinutes: dayData.durationMinutes,
      sessions: dayData.daySessions,
      isLeave: dayData.isLeave,
      leaveDetails: dayData.leaveDetails,
      isHoliday: dayData.isHoliday,
      holidayDetails: dayData.holidayDetails,
      isWeekend: dayData.isWeekend,
      isAbsent: dayData.isAbsent,
      status: dayData.statusClass,
    });
  };

  // Pagination for desktop history table
  const paginatedMobileSessions = useMemo(() => {
    const startIdx = (mobilePage - 1) * mobilePageSize;
    return sessions.slice(startIdx, startIdx + mobilePageSize);
  }, [sessions, mobilePage]);

  // Desktop Table Columns for History Tab
  const historyColumns = [
    {
      title: 'Date',
      dataIndex: 'check_in_at',
      key: 'date',
      render: (val: string) => dayjs(val).format('dddd, MMM DD, YYYY'),
    },
    {
      title: 'Office',
      dataIndex: 'office_name',
      key: 'office',
      render: (val: string) => <Tag color="blue">{val || 'Assigned Office'}</Tag>,
    },
    {
      title: 'Check-In Time',
      dataIndex: 'check_in_at',
      key: 'check_in',
      render: (val: string) => dayjs(val).format('hh:mm:ss A'),
    },
    {
      title: 'Check-Out Time',
      dataIndex: 'check_out_at',
      key: 'check_out',
      render: (val: string | null) =>
        val ? dayjs(val).format('hh:mm:ss A') : <Tag color="processing">Currently Active</Tag>,
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_: any, record: AttendanceSession) => getDurationText(record.check_in_at, record.check_out_at),
    },
    {
      title: 'Check-In Biometrics',
      key: 'biometrics',
      render: (_: any, record: AttendanceSession) => (
        <Space direction="vertical" size={2}>
          <Tag color="green">Match: {(record.check_in_face_similarity * 100).toFixed(0)}%</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Liveness: {record.check_in_liveness_score ? `${(record.check_in_liveness_score * 100).toFixed(0)}%` : 'Passed'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Office Distance',
      dataIndex: 'check_in_distance_meters',
      key: 'distance',
      render: (val: number) => `${Math.round(val)} meters`,
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: isMobile ? 16 : 24 }}>
      {isMobile ? (
        /* ── Mobile View: Focused, Apple HIG History Experience ── */
        <MobileAttendanceHistoryView
          selectedMonth={selectedMonth}
          onPrevMonth={() => setSelectedMonth(selectedMonth.subtract(1, 'month'))}
          onNextMonth={() => setSelectedMonth(selectedMonth.add(1, 'month'))}
          onSelectMonth={(val) => setSelectedMonth(val)}
          onJumpToCurrentMonth={() => setSelectedMonth(dayjs().startOf('month'))}
          metrics={metrics}
          startOffset={startOffset}
          days={days}
          sessions={sessions}
          loading={loading}
          onRetry={fetchMonthData}
        />
      ) : (
        /* ── Desktop View: Spacious Timesheet Calendar & Punch Logs ── */
        <>
          <div className="attendance-summary-wrapper">
          {/* Top Header Section */}
          <div className="attendance-summary-header">
            <div className="attendance-header-top">
              <div>
                <h1 className="attendance-page-title">
                  <ScheduleOutlined style={{ color: '#1677ff' }} />
                  Attendance & Timesheet
                </h1>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: 'block' }}>
                  Monitor monthly working hours, punctuality, and biometric verification logs
                </Text>
              </div>

              {/* Refresh Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tooltip title="Refresh attendance data">
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchMonthData}
                    loading={loading}
                    style={{ borderRadius: 8 }}
                  >
                    Refresh
                  </Button>
                </Tooltip>
              </div>
            </div>

          {/* Navigation Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'summary' | 'history')}
            items={[
              {
                key: 'summary',
                label: (
                  <span>
                    <AppstoreOutlined /> Monthly Timesheet Calendar
                  </span>
                ),
              },
              {
                key: 'history',
                label: (
                  <span>
                    <HistoryOutlined /> Punch Verification Logs
                  </span>
                ),
              },
            ]}
          />
        </div>

        {/* ── TAB 1: Monthly Timesheet Calendar View ── */}
        {activeTab === 'summary' && (
          <div>
            {/* KPI Summary Cards Grid (Real Data) */}
            <div className="attendance-kpi-grid">
              <div className="attendance-kpi-card">
                <div className="attendance-kpi-label">
                  <ClockCircleOutlined style={{ color: '#1677ff' }} /> TOTAL WORKING TIME
                </div>
                <div className="attendance-kpi-value">{metrics.totalHoursFormatted}</div>
                <div className="attendance-kpi-sub">Logged in {selectedMonth.format('MMMM')}</div>
              </div>

              <div className="attendance-kpi-card">
                <div className="attendance-kpi-label">
                  <CheckCircleOutlined style={{ color: '#16a34a' }} /> PRESENT DAYS
                </div>
                <div className="attendance-kpi-value">{metrics.presentDaysCount} Days</div>
                <div className="attendance-kpi-sub">With valid punch sessions</div>
              </div>

              <div className="attendance-kpi-card">
                <div className="attendance-kpi-label">
                  <SmileOutlined style={{ color: '#9333ea' }} /> LEAVES & HOLIDAYS
                </div>
                <div className="attendance-kpi-value">
                  {metrics.leaveDaysCount + metrics.holidayDaysCount} Days
                </div>
                <div className="attendance-kpi-sub">
                  {metrics.leaveDaysCount} Leaves • {metrics.holidayDaysCount} Holidays
                </div>
              </div>

              <div className="attendance-kpi-card">
                <div className="attendance-kpi-label">
                  <HistoryOutlined style={{ color: '#ea580c' }} /> AVG DAILY HOURS
                </div>
                <div className="attendance-kpi-value">{metrics.avgDailyHoursFormatted}</div>
                <div className="attendance-kpi-sub">Average on active work days</div>
              </div>
            </div>

            {/* Month Navigation & Controls Bar */}
            <div className="attendance-month-bar">
              <div className="attendance-month-center">
                <button
                  className="attendance-nav-arrow"
                  onClick={() => setSelectedMonth(selectedMonth.subtract(1, 'month'))}
                  title="Previous Month"
                >
                  <LeftOutlined />
                </button>

                <div className="attendance-month-title">{selectedMonth.format('MMMM YYYY')}</div>

                <button
                  className="attendance-nav-arrow"
                  onClick={() => setSelectedMonth(selectedMonth.add(1, 'month'))}
                  title="Next Month"
                >
                  <RightOutlined />
                </button>

                {/* Jump to Today Button */}
                {!selectedMonth.isSame(dayjs(), 'month') && (
                  <Button
                    size="small"
                    onClick={() => setSelectedMonth(dayjs().startOf('month'))}
                    style={{ borderRadius: 6, fontSize: 12 }}
                  >
                    Current Month
                  </Button>
                )}
              </div>

              {/* Month Picker Dropdown */}
              <div>
                <button
                  className="attendance-picker-btn"
                  onClick={() => setPickerOpen(true)}
                  title="Select month"
                >
                  <CalendarOutlined />
                  <span>Choose Month</span>
                </button>
                <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                  <DatePicker
                    picker="month"
                    open={pickerOpen}
                    value={selectedMonth}
                    onChange={(val) => {
                      if (val) setSelectedMonth(val);
                      setPickerOpen(false);
                    }}
                    onOpenChange={(open) => setPickerOpen(open)}
                  />
                </div>
              </div>
            </div>

            {/* Status Legend Bar */}
            <div className="attendance-legend-bar">
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#16a34a' }} />
                <span>Present (&ge; 8h)</span>
              </div>
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#d97706' }} />
                <span>Short Hours (&lt; 8h)</span>
              </div>
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#2563eb' }} />
                <span>On Leave</span>
              </div>
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#9333ea' }} />
                <span>Holiday</span>
              </div>
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#94a3b8' }} />
                <span>Weekly Off</span>
              </div>
              <div className="attendance-legend-item">
                <span className="attendance-legend-dot" style={{ background: '#dc2626' }} />
                <span>No Punch Logged</span>
              </div>
            </div>

            {/* Weekdays Row */}
            <div className="attendance-weekdays-row">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            {/* 7-Column Day Cards Grid */}
            <div className="attendance-days-grid">
              {/* Empty leading spacer slots */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`spacer-${i}`} className="attendance-day-cell is-empty" />
              ))}

              {/* Real Days of the Month */}
              {days.map((d) => {
                const cellClasses = [
                  'attendance-day-cell',
                  d.isToday ? 'is-today' : '',
                  d.isWeekend ? 'is-weekend' : '',
                  d.isFuture ? 'is-future' : '',
                  selectedDayInfo?.date.isSame(d.date, 'day') ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div key={d.dayNum} className={cellClasses} onClick={() => handleDayClick(d)}>
                    <div className="attendance-day-header">
                      <span className="attendance-day-num">{String(d.dayNum).padStart(2, '0')}</span>
                      {d.isToday && <span className="attendance-today-chip">Today</span>}
                    </div>

                    {d.badgeTextDesktop && (
                      <div className={`attendance-day-badge ${d.statusClass}`} title={d.badgeTextDesktop}>
                        <span className="badge-text-mobile">{d.badgeTextMobile}</span>
                        <span className="badge-text-desktop">{d.badgeTextDesktop}</span>
                      </div>
                    )}

                    {d.timeRangeText && (
                      <div className="attendance-day-times" title={d.timeRangeText}>
                        {d.timeRangeText}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: Punch Logs (Detailed Verification History) ── */}
        {activeTab === 'history' && (
          <div style={{ padding: '20px' }}>
            {/* Mobile View: Native Touch Card List */}
            <div className="attendance-card-list">
              {sessions.length === 0 && !loading ? (
                <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0', border: '1px solid #e2e8f0' }}>
                  <Empty
                    description={
                      <span style={{ color: '#64748b' }}>
                        No punch sessions recorded for {selectedMonth.format('MMMM YYYY')}
                      </span>
                    }
                  />
                </Card>
              ) : (
                <>
                  {paginatedMobileSessions.map((session) => (
                    <AttendanceCard key={session.id} session={session} />
                  ))}

                  {sessions.length > mobilePageSize && (
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                      <Pagination
                        simple
                        current={mobilePage}
                        pageSize={mobilePageSize}
                        total={sessions.length}
                        onChange={(page) => setMobilePage(page)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Desktop View: Full Responsive Table */}
            <div className="attendance-table-desktop">
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: '16px' } }}>
                <Table
                  dataSource={sessions}
                  columns={historyColumns}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 800 }}
                  pagination={{ pageSize: 15 }}
                  locale={{
                    emptyText: (
                      <Empty description={`No attendance sessions found for ${selectedMonth.format('MMMM YYYY')}`} />
                    ),
                  }}
                />
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ── Day Details Inspector Modal / Drawer ── */}
      <Drawer
        title={
          selectedDayInfo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarOutlined style={{ color: '#1677ff' }} />
              <span style={{ fontWeight: 600 }}>{selectedDayInfo.date.format('dddd, MMMM DD, YYYY')}</span>
            </div>
          ) : (
            'Attendance Details'
          )
        }
        placement={isMobile ? 'bottom' : 'right'}
        height={isMobile ? 'auto' : undefined}
        width={isMobile ? '100%' : 460}
        open={Boolean(selectedDayInfo)}
        onClose={() => setSelectedDayInfo(null)}
        styles={{ body: { padding: '16px 20px 24px' } }}
      >
        {selectedDayInfo && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                marginBottom: 20,
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', fontWeight: 600, letterSpacing: '0.5px' }}>
                  RECORDED WORK TIME
                </Text>
                <Text strong style={{ fontSize: 22, color: '#0f172a' }}>
                  {formatDurationClean(selectedDayInfo.durationMinutes)}
                </Text>
              </div>

              <div>
                {selectedDayInfo.durationMinutes >= 8 * 60 ? (
                  <Tag color="green" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    Full Working Day
                  </Tag>
                ) : selectedDayInfo.durationMinutes > 0 ? (
                  <Tag color="orange" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    Short Working Day
                  </Tag>
                ) : selectedDayInfo.isLeave ? (
                  <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    {selectedDayInfo.leaveDetails?.leave_type_name || 'Approved Leave'}
                  </Tag>
                ) : selectedDayInfo.isHoliday ? (
                  <Tag color="purple" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    {selectedDayInfo.holidayDetails?.name || 'Holiday'}
                  </Tag>
                ) : selectedDayInfo.isWeekend ? (
                  <Tag style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    Weekly Off
                  </Tag>
                ) : (
                  <Tag color="red" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                    No Punch Logged
                  </Tag>
                )}
              </div>
            </div>

            {/* Leave Details Note */}
            {selectedDayInfo.isLeave && selectedDayInfo.leaveDetails && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                  Leave Request Details
                </div>
                <div style={{ fontSize: 13, color: '#1e3a8a' }}>
                  <b>Type:</b> {selectedDayInfo.leaveDetails.leave_type_name}
                </div>
                {selectedDayInfo.leaveDetails.reason && (
                  <div style={{ fontSize: 13, color: '#1e3a8a', marginTop: 2 }}>
                    <b>Reason:</b> {selectedDayInfo.leaveDetails.reason}
                  </div>
                )}
              </div>
            )}

            {/* Corporate Holiday Note */}
            {selectedDayInfo.isHoliday && selectedDayInfo.holidayDetails && (
              <div
                style={{
                  background: '#faf5ff',
                  border: '1px solid #e9d5ff',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 600, color: '#6b21a8', marginBottom: 4 }}>
                  Official Holiday
                </div>
                <div style={{ fontSize: 13, color: '#581c87' }}>
                  {selectedDayInfo.holidayDetails.name}
                </div>
                {selectedDayInfo.holidayDetails.description && (
                  <div style={{ fontSize: 12, color: '#7e22ce', marginTop: 2 }}>
                    {selectedDayInfo.holidayDetails.description}
                  </div>
                )}
              </div>
            )}

            {/* Real Sessions Breakdown */}
            {selectedDayInfo.sessions.length > 0 ? (
              <div>
                <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12, color: '#0f172a' }}>
                  Recorded Punch Sessions ({selectedDayInfo.sessions.length})
                </Text>
                {selectedDayInfo.sessions.map((s) => (
                  <AttendanceCard key={s.id} session={s} />
                ))}
              </div>
            ) : (
              !selectedDayInfo.isLeave &&
              !selectedDayInfo.isHoliday && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
                  <ExclamationCircleOutlined style={{ fontSize: 32, color: '#94a3b8', marginBottom: 8 }} />
                  <div style={{ fontSize: 14 }}>No punch sessions recorded for this day.</div>
                </div>
              )
            )}

            <div style={{ marginTop: 24 }}>
              <Button
                block
                type="default"
                icon={<HistoryOutlined />}
                onClick={() => {
                  setSelectedDayInfo(null);
                  setActiveTab('history');
                }}
                style={{ borderRadius: 8 }}
              >
                View Full Punch Audit Logs
              </Button>
            </div>
          </div>
        )}
      </Drawer>
        </>
      )}
    </div>
  );
};
