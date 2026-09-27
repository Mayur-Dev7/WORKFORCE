import React, { useEffect, useState } from 'react';
import { Card, Table, Tabs, Tag, Typography, Button, message } from 'antd';
import { ReloadOutlined, FileProtectOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { AuditLog, LoginAttempt, ApiResponse } from '@workforce/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const AuditLogsPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<AuditLog[]>>('/audit-logs');
      setAuditLogs(res.data.data);
    } catch {
      message.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoginAttempts = async () => {
    try {
      const res = await api.get<ApiResponse<LoginAttempt[]>>('/audit-logs/login-attempts');
      setLoginAttempts(res.data.data);
    } catch {
      console.error('Failed to load login attempts');
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    fetchLoginAttempts();
  }, []);

  const auditColumns = [
    {
      title: 'Timestamp',
      dataIndex: 'created_at',
      key: 'time',
      render: (val: string) => dayjs(val).format('MMM DD, YYYY hh:mm:ss A'),
    },
    {
      title: 'Actor',
      key: 'actor',
      render: (_: any, r: AuditLog) => (
        <div>
          <Text strong>{r.actor_name || 'System / Direct'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.actor_email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Action Event',
      dataIndex: 'action',
      key: 'action',
      render: (action: string) => {
        let color = 'blue';
        if (action.includes('CREATED') || action.includes('ENROLLED')) color = 'green';
        if (action.includes('DISABLED') || action.includes('REJECTED')) color = 'red';
        if (action.includes('REPLACED') || action.includes('CHANGED')) color = 'orange';
        return <Tag color={color}>{action}</Tag>;
      },
    },
    {
      title: 'Entity Target',
      dataIndex: 'entity_type',
      key: 'entity',
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: 'Audit Metadata Details',
      dataIndex: 'metadata',
      key: 'meta',
      render: (meta: any) =>
        meta ? (
          <Text code style={{ fontSize: 11 }}>
            {JSON.stringify(meta)}
          </Text>
        ) : (
          '--'
        ),
    },
  ];

  const attemptColumns = [
    {
      title: 'Timestamp',
      dataIndex: 'created_at',
      key: 'time',
      render: (val: string) => dayjs(val).format('MMM DD, YYYY hh:mm:ss A'),
    },
    {
      title: 'Employee ID',
      dataIndex: 'employee_code',
      key: 'code',
      render: (val: string | null) => (val ? <strong>{val}</strong> : <Text type="secondary">Unknown</Text>),
    },
    {
      title: 'Event Type',
      dataIndex: 'event_type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'SUCCESS' ? 'green' : 'red'}>{type}</Tag>
      ),
    },
    {
      title: 'Failure Diagnostic',
      dataIndex: 'failure_reason',
      key: 'reason',
      render: (val: string | null) => val || <Text type="secondary">N/A</Text>,
    },
    {
      title: 'Network IP & Agent',
      key: 'net',
      render: (_: any, r: LoginAttempt) => (
        <div>
          <Text>{r.ip_address || '127.0.0.1'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.user_agent ? r.user_agent.substring(0, 40) + '...' : ''}
          </Text>
        </div>
      ),
    },
    {
      title: 'Reported Distance',
      dataIndex: 'distance_meters',
      key: 'dist',
      render: (val: number | null) => (val !== null ? `${Math.round(val)}m` : '--'),
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Security Audit Logs & Access Attempts
            </Title>
            <Text type="secondary">Immutable corporate audit trail for compliance and intrusion detection</Text>
          </div>

          <Button icon={<ReloadOutlined />} onClick={() => { fetchAuditLogs(); fetchLoginAttempts(); }} loading={loading}>
            Refresh Audit Feed
          </Button>
        </div>

        <Tabs
          defaultActiveKey="audit"
          items={[
            {
              key: 'audit',
              label: (
                <span>
                  <FileProtectOutlined /> System Mutation Audit Trail
                </span>
              ),
              children: (
                <Table
                  dataSource={auditLogs}
                  columns={auditColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 12 }}
                />
              ),
            },
            {
              key: 'attempts',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Authentication & Verification Attempts
                </span>
              ),
              children: (
                <Table
                  dataSource={loginAttempts}
                  columns={attemptColumns}
                  rowKey="id"
                  pagination={{ pageSize: 12 }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
