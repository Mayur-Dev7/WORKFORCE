import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Tag,
  Alert,
  Table,
  Space,
  Typography,
  Spin,
  Descriptions,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  SmileOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { AttendanceSession, Office, ApiResponse } from '@workforce/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [history, setHistory] = useState<AttendanceSession[]>([]);
  const [office, setOffice] = useState<Office | null>(null);
  const [userDistance, setUserDistance] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Haversine on client for UI convenience
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

        // Get browser coordinates
        if ('geolocation' in navigator) {
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
              setGeoError(`Location access: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.office_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isInsideGeofence =
    userDistance !== null && office ? userDistance <= office.radius_meters : null;

  const todaySessions = history.filter(
    (h) => dayjs(h.check_in_at).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD')
  );
  const latestTodaySession = todaySessions[0] || activeSession;

  const columns = [
    {
      title: 'Date',
      dataIndex: 'check_in_at',
      key: 'date',
      render: (val: string) => dayjs(val).format('MMM DD, YYYY'),
    },
    {
      title: 'Check-In',
      dataIndex: 'check_in_at',
      key: 'check_in',
      render: (val: string) => dayjs(val).format('hh:mm A'),
    },
    {
      title: 'Check-Out',
      dataIndex: 'check_out_at',
      key: 'check_out',
      render: (val: string | null) => (val ? dayjs(val).format('hh:mm A') : <Tag color="processing">In Session</Tag>),
    },
    {
      title: 'Face Match',
      dataIndex: 'check_in_face_similarity',
      key: 'similarity',
      render: (val: number) => <Tag color="green">{(val * 100).toFixed(0)}% Match</Tag>,
    },
    {
      title: 'Distance',
      dataIndex: 'check_in_distance_meters',
      key: 'distance',
      render: (val: number) => `${Math.round(val)}m from office`,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="Loading employee dashboard..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Welcome Card */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={2} style={{ margin: 0 }}>
              Welcome, {user?.name} 👋
            </Title>
            <Text type="secondary" style={{ fontSize: 16 }}>
              Employee ID: <strong>{user?.employee_code}</strong> | Assigned to{' '}
              <strong>{office?.name || user?.office_name}</strong>
            </Text>
            <div style={{ marginTop: 12 }}>
              <Space>
                {user?.face_enrolled ? (
                  <Tag icon={<SmileOutlined />} color="success">
                    Biometric Face Enrolled
                  </Tag>
                ) : (
                  <Tag icon={<WarningOutlined />} color="warning">
                    Face Profile Not Enrolled
                  </Tag>
                )}

                {isInsideGeofence === true && (
                  <Tag icon={<EnvironmentOutlined />} color="success">
                    Inside Office Geofence ({userDistance}m)
                  </Tag>
                )}
                {isInsideGeofence === false && (
                  <Tag icon={<EnvironmentOutlined />} color="error">
                    Outside Geofence ({userDistance}m / max {office?.radius_meters}m)
                  </Tag>
                )}
                {userDistance === null && (
                  <Tag icon={<EnvironmentOutlined />} color="default">
                    Detecting Location...
                  </Tag>
                )}
              </Space>
            </div>
          </Col>

          {/* Primary Action Button */}
          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            {activeSession ? (
              <Button
                type="primary"
                danger
                size="large"
                icon={<CloseCircleOutlined />}
                style={{ height: 60, width: '100%', fontSize: 18, borderRadius: 8 }}
                onClick={() => navigate('/employee/attendance/check-out')}
              >
                CHECK OUT NOW
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                style={{
                  height: 60,
                  width: '100%',
                  fontSize: 18,
                  borderRadius: 8,
                  background: '#16a34a',
                  borderColor: '#16a34a',
                }}
                disabled={!user?.face_enrolled}
                onClick={() => navigate('/employee/attendance/check-in')}
              >
                CHECK IN NOW
              </Button>
            )}
            {!user?.face_enrolled && (
              <Text type="danger" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Please ask HR / Administrator to enroll your face profile before check-in.
              </Text>
            )}
          </Col>
        </Row>
      </Card>

      {/* Geolocation Notice if any */}
      {geoError && (
        <Alert
          message="Geolocation Warning"
          description={geoError}
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Status Cards */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Today's Check-In"
              value={
                latestTodaySession?.check_in_at
                  ? dayjs(latestTodaySession.check_in_at).format('hh:mm A')
                  : '--:--'
              }
              prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Today's Check-Out"
              value={
                latestTodaySession?.check_out_at
                  ? dayjs(latestTodaySession.check_out_at).format('hh:mm A')
                  : activeSession
                  ? 'Currently Active'
                  : '--:--'
              }
              prefix={<ClockCircleOutlined style={{ color: activeSession ? '#52c41a' : '#8c8c8c' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title="Current Office Distance"
              value={userDistance !== null ? `${userDistance} m` : 'Calculating...'}
              prefix={<EnvironmentOutlined style={{ color: isInsideGeofence ? '#52c41a' : '#f5222d' }} />}
              suffix={office ? `/ ${office.radius_meters}m allowed` : ''}
            />
          </Card>
        </Col>
      </Row>

      {/* Recent Attendance Sessions Table */}
      <Card title="Recent Attendance Sessions" style={{ borderRadius: 12 }}>
        <Table
          dataSource={history}
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: 'No recent attendance sessions logged' }}
        />
      </Card>
    </div>
  );
};
