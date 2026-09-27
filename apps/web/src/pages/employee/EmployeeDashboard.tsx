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
  message,
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

        // Resilient location fetching with high-accuracy fallback
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
                // Indoor Wi-Fi or mobile satellite delay fallback
                obtainCoords(false);
              } else {
                setGeoError(`Location detection: ${err.message}. Tap "Retry Location" to grant permission.`);
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
              <Space wrap>
                {user?.face_enrolled ? (
                  <Tag icon={<SmileOutlined />} color="success">
                    Biometric Face Enrolled
                  </Tag>
                ) : (
                  <Tag icon={<WarningOutlined />} color="warning">
                    Face Profile Not Enrolled
                  </Tag>
                )}

                <Button
                  size="small"
                  type="link"
                  icon={<IdcardOutlined />}
                  onClick={() => navigate('/employee/face-enrollment')}
                >
                  {user?.face_enrolled ? 'Update Reference Face' : 'Upload Reference Face Photo'}
                </Button>

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
                  <Tag
                    icon={<EnvironmentOutlined />}
                    color={geoError ? 'warning' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={refreshLocation}
                  >
                    {geoError ? 'Location Unavailable (Tap to Retry)' : 'Detecting Location... (Tap to Refresh)'}
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
                  background: user?.face_enrolled ? '#16a34a' : undefined,
                  borderColor: user?.face_enrolled ? '#16a34a' : undefined,
                }}
                disabled={!user?.face_enrolled}
                onClick={() => navigate('/employee/attendance/check-in')}
              >
                CHECK IN NOW
              </Button>
            )}
            {!user?.face_enrolled && (
              <div style={{ marginTop: 8 }}>
                <Text type="danger" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                  Reference face photo required before check-in.
                </Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<IdcardOutlined />}
                  onClick={() => navigate('/employee/face-enrollment')}
                >
                  Upload Reference Face
                </Button>
              </div>
            )}
          </Col>
        </Row>
      </Card>

      {!user?.face_enrolled && (
        <Alert
          message="Setup Your Biometric Face ID"
          description={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <span>
                To check in at your office, upload or capture your official reference photo once.
                The system stores your photo and biometric template to verify your identity at each check-in.
              </span>
              <Button
                type="primary"
                icon={<IdcardOutlined />}
                onClick={() => navigate('/employee/face-enrollment')}
              >
                Upload Face Photo Now
              </Button>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24, borderRadius: 12 }}
        />
      )}

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
