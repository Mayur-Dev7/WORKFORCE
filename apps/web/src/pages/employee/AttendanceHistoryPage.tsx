import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Button, Space, message } from 'antd';
import { ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { AttendanceSession, ApiResponse } from '@workforce/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const AttendanceHistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(false);

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
      render: (_: any, record: AttendanceSession) => {
        if (!record.check_out_at) return '--';
        const start = dayjs(record.check_in_at);
        const end = dayjs(record.check_out_at);
        const diffMins = end.diff(start, 'minute');
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hrs}h ${mins}m`;
      },
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
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>
              Personal Attendance Logs & History
            </Title>
            <Button icon={<ReloadOutlined />} onClick={fetchHistory} loading={loading}>
              Refresh Logs
            </Button>
          </div>
        }
        style={{ borderRadius: 12 }}
      >
        <Table
          dataSource={sessions}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: 'No attendance history recorded yet' }}
        />
      </Card>
    </div>
  );
};
