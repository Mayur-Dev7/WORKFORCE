import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Spin,
  Empty,
} from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserDeleteOutlined,
  WarningOutlined,
  EnvironmentOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { AttendanceSession, ApiResponse } from '@workforce/shared';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

interface AdminStats {
  totalEmployees: number;
  activeEmployees: number;
  todayAttendance: number;
  currentlyCheckedIn: number;
  absentToday: number;
  failedFaceAttempts: number;
  failedGeofenceAttempts: number;
  employeesWithoutFace: number;
}

/** Mobile card for displaying recent live verified access feed */
const LiveFeedCard: React.FC<{ session: AttendanceSession }> = ({ session }) => {
  const isCompleted = Boolean(session.check_out_at);

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <Text strong style={{ fontSize: 14 }}>{session.user_name}</Text>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
            {session.employee_code}
          </Text>
        </div>

        {isCompleted ? (
          <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
            Completed ({dayjs(session.check_out_at).format('hh:mm A')})
          </Tag>
        ) : (
          <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>
            In Session
          </Tag>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <Tag color="blue" icon={<EnvironmentOutlined />} style={{ margin: 0, fontSize: 11 }}>
          {session.office_name}
        </Tag>
        <Tag color="green" icon={<SafetyCertificateOutlined />} style={{ margin: 0, fontSize: 11 }}>
          Match: {(session.check_in_face_similarity * 100).toFixed(0)}%
        </Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>
          📍 {Math.round(session.check_in_distance_meters)}m
        </Text>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {dayjs(session.check_in_at).format('hh:mm:ss A')}
        </Text>
      </div>
    </Card>
  );
};

export const AdminDashboard: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLiveSessions, setRecentLiveSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        api.get<ApiResponse<AdminStats>>('/reports/stats'),
        api.get<ApiResponse<AttendanceSession[]>>('/attendance/team?limit=8'),
      ]);
      setStats(statsRes.data.data);
      setRecentLiveSessions(sessionsRes.data.data);
    } catch (err) {
      console.error('Error fetching admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const columns = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_: any, r: AttendanceSession) => (
        <div>
          <Text strong>{r.user_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.employee_code}
          </Text>
        </div>
      ),
    },
    {
      title: 'Office',
      dataIndex: 'office_name',
      key: 'office',
      render: (val: string) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: 'Check-In',
      dataIndex: 'check_in_at',
      key: 'check_in',
      render: (val: string) => dayjs(val).format('hh:mm:ss A'),
    },
    {
      title: 'Distance',
      dataIndex: 'check_in_distance_meters',
      key: 'distance',
      render: (val: number) => `${Math.round(val)}m`,
    },
    {
      title: 'Face Match',
      dataIndex: 'check_in_face_similarity',
      key: 'face',
      render: (val: number) => <Tag color="green">{(val * 100).toFixed(0)}%</Tag>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, r: AttendanceSession) =>
        r.check_out_at ? (
          <Tag color="default">Completed ({dayjs(r.check_out_at).format('hh:mm A')})</Tag>
        ) : (
          <Tag color="processing">In Session</Tag>
        ),
    },
  ];

  if (loading && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Spin size="large" />
        <span style={{ color: '#8c8c8c', fontSize: 13 }}>Loading workforce telemetry...</span>
      </div>
    );
  }

  const attendanceRate =
    stats && stats.activeEmployees > 0
      ? Math.round((stats.todayAttendance / stats.activeEmployees) * 100)
      : 0;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 22 }}>
            Workforce & Access Overview
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Real-time attendance telemetry and geofence compliance
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchDashboardData}
          loading={loading}
          style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
        >
          Refresh Telemetry
        </Button>
      </div>

      {/* KPI Statistic Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: '14px' } }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Total Workforce</span>}
              value={stats?.totalEmployees || 0}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
              suffix={<span style={{ fontSize: 11, color: '#8c8c8c' }}>({stats?.activeEmployees || 0})</span>}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: '14px' } }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Today's Verified</span>}
              value={stats?.todayAttendance || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: '14px' } }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Currently Checked In</span>}
              value={stats?.currentlyCheckedIn || 0}
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: '14px' } }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Absent Today</span>}
              value={stats?.absentToday || 0}
              prefix={<UserDeleteOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Security & Failure Indicators */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, borderLeft: '4px solid #ff4d4f' }}
            styles={{ body: { padding: '14px' } }}
          >
            <Statistic
              title={<span style={{ fontSize: 12 }}>Face Failures Today</span>}
              value={stats?.failedFaceAttempts || 0}
              prefix={<SafetyCertificateOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: stats?.failedFaceAttempts ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, borderLeft: '4px solid #fa8c16' }}
            styles={{ body: { padding: '14px' } }}
          >
            <Statistic
              title={<span style={{ fontSize: 12 }}>Geofence Violations</span>}
              value={stats?.failedGeofenceAttempts || 0}
              prefix={<EnvironmentOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: stats?.failedGeofenceAttempts ? '#d4380d' : undefined }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, borderLeft: '4px solid #faad14' }}
            styles={{ body: { padding: '14px' } }}
          >
            <Statistic
              title={<span style={{ fontSize: 12 }}>Missing Face Biometrics</span>}
              value={stats?.employeesWithoutFace || 0}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Attendance Rate Progress and Live Activity */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card
            title="Today's Attendance Rate"
            style={{ borderRadius: 12, height: '100%' }}
            styles={{ body: { padding: '16px' } }}
          >
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Progress
                type="dashboard"
                percent={attendanceRate}
                size={isMobile ? 140 : 180}
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
              />
              <Paragraph style={{ marginTop: 12, fontSize: 13, marginBottom: 0 }}>
                <strong>{stats?.todayAttendance}</strong> out of{' '}
                <strong>{stats?.activeEmployees}</strong> active staff members verified today.
              </Paragraph>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card
            title="Live Verified Access Feed"
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: isMobile ? '12px' : '16px' } }}
          >
            {/* Mobile feed card list */}
            <div className="admin-feed-card-list">
              {recentLiveSessions.length === 0 ? (
                <Empty description="No live activity recorded yet today" style={{ padding: '20px 0' }} />
              ) : (
                recentLiveSessions.map((session) => (
                  <LiveFeedCard key={session.id} session={session} />
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="admin-feed-table-desktop">
              <Table
                dataSource={recentLiveSessions}
                columns={columns}
                rowKey="id"
                pagination={false}
                scroll={{ x: 650 }}
                locale={{ emptyText: <Empty description="No live activity recorded yet today" /> }}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
