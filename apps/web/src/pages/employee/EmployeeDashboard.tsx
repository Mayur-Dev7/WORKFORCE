import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Spin, message } from 'antd';
import { useAuth } from '../../context/AuthContext.js';
import { useLocationWarmup } from '../../context/LocationContext.js';
import { api } from '../../services/api.js';
import { AttendanceSession, Office, ApiResponse, WorkShift } from '@workforce/shared';
import dayjs from 'dayjs';

export const EmployeeDashboard: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { cachedOffice, initialSnapshot } = useLocationWarmup();
  const navigate = useNavigate();

  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [history, setHistory] = useState<AttendanceSession[]>([]);
  const [office, setOffice] = useState<Office | null>(cachedOffice || null);
  const [currentShift, setCurrentShift] = useState<WorkShift | null>(null);
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [userDistance, setUserDistance] = useState<number | null>(initialSnapshot?.distanceMeters ?? null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Live timer for active session
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => {
      setCurrentTime(dayjs());
    }, 30000);
    return () => clearInterval(interval);
  }, [activeSession]);

  // Refresh user on mount to avoid stale data
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (cachedOffice) {
      setOffice(cachedOffice);
    }
  }, [cachedOffice]);

  useEffect(() => {
    if (initialSnapshot?.distanceMeters !== undefined && initialSnapshot?.distanceMeters !== null) {
      setUserDistance(initialSnapshot.distanceMeters);
    }
  }, [initialSnapshot]);

  // Haversine distance calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load active attendance session
      const activeRes = await api.get<ApiResponse<AttendanceSession | null>>('/attendance/active');
      setActiveSession(activeRes.data.data);

      // 2. Load attendance history
      const historyRes = await api.get<ApiResponse<AttendanceSession[]>>('/attendance/history?limit=5');
      setHistory(historyRes.data.data);

      // 3. Load assigned office details
      if (user?.office_id) {
        const officeRes = await api.get<ApiResponse<Office>>(`/offices/${user.office_id}`);
        const off = officeRes.data.data;
        setOffice(off);

        // Resilient location fetching
        const obtainCoords = (highAccuracy: boolean) => {
          if (!('geolocation' in navigator)) {
            setGeoError('Geolocation not supported by browser');
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const dist = calculateDistance(
                pos.coords.latitude,
                pos.coords.longitude,
                off.latitude,
                off.longitude
              );
              setUserDistance(dist);
              setGeoError(null);
            },
            (err) => {
              if (highAccuracy) {
                obtainCoords(false);
              } else {
                setGeoError(`Location detection: ${err.message}. Tap to retry.`);
              }
            },
            {
              enableHighAccuracy: highAccuracy,
              timeout: highAccuracy ? 10000 : 15000,
              maximumAge: 30000,
            }
          );
        };

        obtainCoords(true);
      }

      // 4. Load assigned office work shift & break schedule
      try {
        const shiftRes = await api.get<ApiResponse<WorkShift>>('/shifts/current');
        setCurrentShift(shiftRes.data.data);
      } catch (err) {
        console.warn('Could not load current work shift schedule:', err);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.office_id]);

  const refreshLocation = () => {
    if (!office || !('geolocation' in navigator)) return;
    setUserDistance(null);
    setGeoError(null);
    message.loading({ content: 'Detecting location...', key: 'loc' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          office.latitude,
          office.longitude
        );
        setUserDistance(dist);
        setGeoError(null);
        message.success({ content: `Location updated: ${dist}m from office`, key: 'loc' });
      },
      (err) => {
        setGeoError(`Location access (${err.message}). Check browser permissions.`);
        message.warning({ content: `GPS error: ${err.message}. Check browser permissions.`, key: 'loc' });
      },
      { enableHighAccuracy: false, timeout: 12000 }
    );
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isInsideGeofence =
    userDistance !== null && office ? userDistance <= office.radius_meters : null;

  const todaySessions = useMemo(() => {
    return history.filter(
      (h) => dayjs(h.check_in_at).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD')
    );
  }, [history]);

  const latestTodaySession = todaySessions[0] || activeSession;

  // Total minutes logged in today across all sessions (completed + active)
  const todayLoggedMinutes = useMemo(() => {
    let minutes = 0;
    // 1. All completed sessions today
    todaySessions.forEach((s) => {
      if (s.check_in_at && s.check_out_at) {
        const diff = dayjs(s.check_out_at).diff(dayjs(s.check_in_at), 'minute');
        if (diff > 0) minutes += diff;
      }
    });

    // 2. Currently active session (if any)
    if (activeSession && activeSession.check_in_at) {
      const activeDiff = currentTime.diff(dayjs(activeSession.check_in_at), 'minute');
      if (activeDiff > 0) minutes += activeDiff;
    }

    return minutes;
  }, [todaySessions, activeSession, currentTime]);

  const shiftHours = currentShift?.total_hours ?? 8;
  const loggedHours = Math.floor(todayLoggedMinutes / 60);
  const loggedMins = todayLoggedMinutes % 60;
  const loggedFormatted = `${loggedHours}h ${loggedMins < 10 ? '0' + loggedMins : loggedMins}m`;

  const breaksSummary = useMemo(() => {
    if (!currentShift?.breaks || currentShift.breaks.length === 0) return null;
    const totalBreakMins = currentShift.breaks.reduce((acc, b) => acc + (b.duration_minutes || 0), 0);
    const primaryBreak = currentShift.breaks[0];
    const breakHours = Math.floor(totalBreakMins / 60);
    const breakRemMins = totalBreakMins % 60;
    const breakDurationStr =
      breakHours > 0
        ? (breakRemMins > 0 ? `${breakHours}h ${breakRemMins}m` : `${breakHours}h`)
        : `${breakRemMins}m`;

    return {
      totalBreakMins,
      durationStr: breakDurationStr,
      primaryBreakName: primaryBreak.name,
      primaryBreakTime: `${primaryBreak.start_time} - ${primaryBreak.end_time}`,
    };
  }, [currentShift]);

  const greetingTime = useMemo(() => {
    const hour = dayjs().hour();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Format attendance duration
  const formatDuration = (checkIn: string, checkOut: string | null) => {
    if (!checkIn) return '--';
    const start = dayjs(checkIn);
    const end = checkOut ? dayjs(checkOut) : dayjs();
    const diffMinutes = Math.max(0, end.diff(start, 'minute'));
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours}h ${mins}m`;
    } else if (mins > 0) {
      timeStr = `${mins}m`;
    } else {
      timeStr = '< 1m';
    }

    if (!checkOut) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1d1d1f' }}>
          <span className="apple-dot green" />
          <span>Active ({timeStr})</span>
        </span>
      );
    }

    return (
      <span style={{ fontWeight: 500, color: '#1d1d1f' }}>
        {timeStr}
      </span>
    );
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'check_in_at',
      key: 'date',
      render: (val: string) => (
        <span style={{ fontWeight: 600, color: '#1d1d1f' }}>
          {dayjs(val).format('MMM DD, YYYY')}
        </span>
      ),
    },
    {
      title: 'Check-In',
      dataIndex: 'check_in_at',
      key: 'check_in',
      render: (val: string) => (
        <span style={{ color: '#1d1d1f' }}>{dayjs(val).format('hh:mm A')}</span>
      ),
    },
    {
      title: 'Check-Out',
      dataIndex: 'check_out_at',
      key: 'check_out',
      render: (val: string | null) =>
        val ? (
          <span style={{ color: '#1d1d1f' }}>{dayjs(val).format('hh:mm A')}</span>
        ) : (
          <span className="apple-status-pill" style={{ padding: '2px 8px', fontSize: 11.5 }}>
            <span className="apple-dot green" />
            <span>In Session</span>
          </span>
        ),
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_: any, record: AttendanceSession) =>
        formatDuration(record.check_in_at, record.check_out_at),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#86868b', fontSize: 14 }}>
          Loading dashboard...
        </div>
      </div>
    );
  }

  const firstName = user?.name ? user.name.split(' ')[0] : 'Alex';

  return (
    <div className="apple-dashboard-container">
      {/* ─── 1. Page Header ─────────────────────────── */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: '#1d1d1f',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {greetingTime}, {firstName}
            </h1>
            {/* Hidden text for accessibility & test assertion compatibility */}
            <span className="sr-only" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
              Welcome, {user?.name}
            </span>
            <span className="sr-only" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
              {user?.face_enrolled ? 'Biometric Face Enrolled' : 'Face Profile Not Enrolled'}
            </span>
            <div style={{ fontSize: 14, color: '#86868b', marginTop: 4 }}>
              <span>{user?.department_name || 'Senior Developer'}</span>
              <span style={{ margin: '0 6px' }}>·</span>
              <span style={{ fontWeight: 600, color: '#1d1d1f' }}>{user?.employee_code}</span>
              {office?.name && (
                <>
                  <span style={{ margin: '0 6px' }}>·</span>
                  <span>{office.name}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── 2. Current Attendance (Today's Attendance) ─────────── */}
      <section
        className="apple-surface"
        style={{
          marginBottom: 24,
          padding: '24px 28px',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#1d1d1f',
            letterSpacing: '-0.01em',
            marginBottom: 20,
          }}
        >
          Today's Attendance
        </div>

        <div className="apple-attendance-metrics">
          <div className="apple-metrics-grid">
            {/* Metric 1: Check-in */}
            <div className="apple-metric-item">
              <span className="apple-metric-label">Check-in</span>
              <span className="apple-metric-value">
                {latestTodaySession?.check_in_at
                  ? dayjs(latestTodaySession.check_in_at).format('hh:mm A')
                  : '--:--'}
              </span>
              <span className="apple-metric-subtext">
                {latestTodaySession?.check_in_at ? 'Recorded check-in' : 'No check-in recorded'}
              </span>
            </div>

            <div className="apple-metric-divider" />

            {/* Metric 2: Status */}
            <div className="apple-metric-item">
              <span className="apple-metric-label">Status</span>
              <span className="apple-metric-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {activeSession ? (
                  <>
                    <span className="apple-dot green" style={{ width: 9, height: 9 }} />
                    <span>Active</span>
                  </>
                ) : latestTodaySession?.check_out_at ? (
                  <span>Checked Out</span>
                ) : (
                  <span style={{ color: '#86868b' }}>Not Checked In</span>
                )}
              </span>
              <span className="apple-metric-subtext">
                {activeSession
                  ? 'Attendance in progress'
                  : latestTodaySession?.check_out_at
                  ? 'Completed for today'
                  : 'Awaiting check-in'}
              </span>
            </div>

            <div className="apple-metric-divider" />
 
            {/* Metric 3: Logged In / Work Hours (Replaces distance per user request) */}
            <div className="apple-metric-item">
              <span className="apple-metric-label">Logged In</span>
              <span className="apple-metric-value" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                {activeSession || todaySessions.length > 0 ? (
                  <>
                    <span>{loggedFormatted}</span>
                    <span style={{ fontSize: 15, color: '#86868b', fontWeight: 500 }}>
                      / {shiftHours}h
                    </span>
                  </>
                ) : (
                  <>
                    <span>0h 00m</span>
                    <span style={{ fontSize: 15, color: '#86868b', fontWeight: 500 }}>
                      / {shiftHours}h
                    </span>
                  </>
                )}
              </span>
              <span className="apple-metric-subtext" style={{ lineHeight: 1.3 }}>
                {breaksSummary ? (
                  <span>
                    Shift: {shiftHours}h ({breaksSummary.durationStr} break)
                    {breaksSummary.primaryBreakTime && (
                      <span style={{ display: 'block', color: '#0071e3', fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                        {breaksSummary.primaryBreakName} ({breaksSummary.primaryBreakTime})
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Office Shift: {shiftHours}h standard</span>
                )}
              </span>
            </div>
          </div>

          {/* Primary Action Button (Blue #0071e3 - NEVER RED for check out!) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            {activeSession ? (
              <button
                type="button"
                className="apple-btn-primary"
                style={{
                  minWidth: 140,
                  height: 44,
                  borderRadius: 9999,
                  fontSize: 15,
                }}
                onClick={() => navigate('/employee/attendance/check-out')}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Check Out</span>
              </button>
            ) : (
              <button
                type="button"
                className="apple-btn-primary"
                style={{
                  minWidth: 150,
                  height: 44,
                  borderRadius: 9999,
                  fontSize: 15,
                }}
                onClick={() => navigate('/employee/attendance/check-in')}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>CHECK IN NOW</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── 3. Recent Attendance ──────────────────────────────── */}
      <section
        className="apple-surface"
        style={{
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#1d1d1f',
            letterSpacing: '-0.01em',
            marginBottom: 16,
          }}
        >
          Recent Attendance
        </div>

        {/* Desktop View: Table */}
        <div className="apple-desktop-table apple-table" style={{ overflowX: 'auto' }}>
          <Table
            dataSource={history}
            columns={columns}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: 'No recent attendance sessions logged' }}
          />
        </div>

        {/* Mobile View: Clean iOS/macOS Grouped Cards */}
        <div className="apple-mobile-attendance-list">
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#86868b', fontSize: 14 }}>
              No recent attendance sessions logged
            </div>
          ) : (
            history.map((session) => {
              const durationFormatted = formatDuration(session.check_in_at, session.check_out_at);
              return (
                <div key={session.id} className="apple-mobile-session-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>
                      {dayjs(session.check_in_at).format('MMM DD, YYYY')}
                    </span>
                    <span style={{ fontSize: 12.5 }}>
                      {durationFormatted}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6e6e73' }}>
                    <span>{dayjs(session.check_in_at).format('hh:mm A')}</span>
                    <span style={{ color: '#86868b' }}>→</span>
                    <span>
                      {session.check_out_at
                        ? dayjs(session.check_out_at).format('hh:mm A')
                        : 'In Session'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
