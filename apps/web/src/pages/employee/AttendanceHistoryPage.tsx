import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Tag, Typography, Button, Space, message, Empty, Pagination, Row, Col, Statistic } from 'antd';
import {
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { AttendanceSession, ApiResponse } from '@workforce/shared';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import dayjs from 'dayjs';

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
        border: '1px solid #e5e7eb',
      }}
      styles={{ body: { padding: '14px 14px' } }}
    >
      {/* Top row: Date & Status Badge */}
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

      {/* Timing Details Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          background: '#f9fafb',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '10px 0',
        }}
      >
        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHECK-IN TIME
          </Text>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginTop: 2 }}>
            {dayjs(session.check_in_at).format('hh:mm:ss A')}
          </div>
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px' }}>
            CHECK-OUT TIME
          </Text>
          <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#1677ff' : '#111827', marginTop: 2 }}>
            {session.check_out_at ? dayjs(session.check_out_at).format('hh:mm:ss A') : 'Currently Active'}
          </div>
        </div>
      </div>

      {/* Biometrics & Geolocation Verification Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          paddingTop: 4,
          borderTop: '1px solid #f3f4f6',
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
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;
  const isMobile = useIsMobile(768);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<AttendanceSession[]>>('/attendance/history?limit=100');
      setSessions(res.data.data);
    } catch {
      message.error('Failed to load attendance history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Compute pagination slice for mobile view
  const paginatedMobileSessions = useMemo(() => {
    const startIdx = (mobilePage - 1) * mobilePageSize;
    return sessions.slice(startIdx, startIdx + mobilePageSize);
  }, [sessions, mobilePage]);

  // Desktop Table Columns
  const columns = [
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
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>
            <ClockCircleOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Attendance History
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Personal punch logs and biometric verifications
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          onClick={fetchHistory}
          loading={loading}
          style={{ borderRadius: 8 }}
        >
          Refresh Logs
        </Button>
      </div>

      {/* ── Mobile View: Native Touch Card List ── */}
      <div className="attendance-card-list">
        {sessions.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
            <Empty description="No attendance history recorded yet" />
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

      {/* ── Desktop View: Full Responsive Table ── */}
      <div className="attendance-table-desktop">
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={sessions}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 800 }}
            pagination={{ pageSize: 15 }}
            locale={{ emptyText: <Empty description="No attendance history recorded yet" /> }}
          />
        </Card>
      </div>
    </div>
  );
};
