import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Alert,
  Typography,
  Button,
  Space,
  Spin,
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

export const AdminDashboard: React.FC = () => {
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
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="Loading workforce telemetry..." />
      </div>
    );
  }

  const attendanceRate =
    stats && stats.activeEmployees > 0
      ? Math.round((stats.todayAttendance / stats.activeEmployees) * 100)
      : 0;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Enterprise Workforce & Biometric Access Overview
          </Title>
          <Text type="secondary">Real-time attendance telemetry and geofence compliance</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchDashboardData} loading={loading}>
          Refresh Telemetry
        </Button>
      </div>

      {/* KPI Statistic Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Total Workforce"
              value={stats?.totalEmployees || 0}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
              suffix={`(${stats?.activeEmployees || 0} Active)`}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Today's Verified Attendance"
              value={stats?.todayAttendance || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Currently Checked In"
              value={stats?.currentlyCheckedIn || 0}
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Absent Today"
              value={stats?.absentToday || 0}
              prefix={<UserDeleteOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Security & Failure Indicators */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, borderLeft: '4px solid #ff4d4f' }}
          >
            <Statistic
              title="Face Verification Failures Today"
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
          >
            <Statistic
              title="Geofence Boundary Violations"
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
          >
            <Statistic
              title="Employees Missing Face Biometrics"
              value={stats?.employeesWithoutFace || 0}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Attendance Rate Progress and Live Activity */}
      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card title="Today's Attendance Rate" style={{ borderRadius: 12, height: '100%' }}>
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Progress
                type="dashboard"
                percent={attendanceRate}
                size={180}
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
              />
              <Paragraph style={{ marginTop: 16 }}>
                <strong>{stats?.todayAttendance}</strong> out of{' '}
                <strong>{stats?.activeEmployees}</strong> active staff members have verified attendance
                today.
              </Paragraph>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title="Live Verified Access Feed" style={{ borderRadius: 12 }}>
            <Table
              dataSource={recentLiveSessions}
              columns={columns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'No live activity recorded yet today' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
