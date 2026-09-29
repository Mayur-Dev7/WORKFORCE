import React, { useEffect, useState } from 'react';
import { Card, Table, Tabs, Tag, Typography, Button, message, Pagination, Empty } from 'antd';
import { ReloadOutlined, FileProtectOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api } from '../../services/api.js';
import { AuditLog, LoginAttempt, ApiResponse } from '@workforce/shared';
import dayjs from 'dayjs';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Title, Text } = Typography;

export const AuditLogsPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [attemptPage, setAttemptPage] = useState(1);
  const mobilePageSize = 8;

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

  const getActionColor = (action: string) => {
    if (action.includes('CREATED') || action.includes('ENROLLED')) return 'green';
    if (action.includes('DISABLED') || action.includes('REJECTED')) return 'red';
    if (action.includes('REPLACED') || action.includes('CHANGED')) return 'orange';
    return 'blue';
  };

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
      render: (action: string) => <Tag color={getActionColor(action)}>{action}</Tag>,
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

  // Mobile paginated data
  const paginatedAuditLogs = auditLogs.slice((auditPage - 1) * mobilePageSize, auditPage * mobilePageSize);
  const paginatedLoginAttempts = loginAttempts.slice((attemptPage - 1) * mobilePageSize, attemptPage * mobilePageSize);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
              Security Audit Logs & Access Attempts
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Immutable corporate audit trail for compliance and intrusion detection
            </Text>
          </div>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchAuditLogs();
              fetchLoginAttempts();
            }}
            loading={loading}
            style={isMobile ? { width: '100%' } : undefined}
          >
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
                <>
                  {/* Desktop Table */}
                  <div className="audit-table-desktop">
                    <Table
                      dataSource={auditLogs}
                      columns={auditColumns}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 12 }}
                      scroll={{ x: 800 }}
                    />
                  </div>

                  {/* Mobile Card List */}
                  <div className="audit-card-list">
                    {auditLogs.length === 0 ? (
                      <Empty description="No audit log entries recorded" style={{ padding: '24px 0' }} />
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {paginatedAuditLogs.map((log) => (
                            <Card
                              key={log.id}
                              size="small"
                              style={{
                                borderRadius: 12,
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <Tag color={getActionColor(log.action)} style={{ fontWeight: 600, fontSize: 12 }}>
                                  {log.action}
                                </Tag>
                                <Tag style={{ fontSize: 11 }}>{log.entity_type}</Tag>
                              </div>

                              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 10 }}>
                                {dayjs(log.created_at).format('MMM DD, YYYY hh:mm:ss A')}
                              </div>

                              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }}>
                                <div style={{ marginBottom: 4 }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Actor: </Text>
                                  <Text strong>{log.actor_name || 'System / Direct'}</Text>
                                </div>
                                {log.actor_email && (
                                  <div style={{ color: '#6b7280', fontSize: 11 }}>
                                    {log.actor_email}
                                  </div>
                                )}
                              </div>

                              {log.metadata && (
                                <div style={{ marginTop: 6 }}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                                    Metadata Details:
                                  </Text>
                                  <div
                                    style={{
                                      background: '#f3f4f6',
                                      padding: '6px 8px',
                                      borderRadius: 6,
                                      maxHeight: 100,
                                      overflowY: 'auto',
                                    }}
                                  >
                                    <Text code style={{ fontSize: 10, wordBreak: 'break-all', display: 'block' }}>
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </Text>
                                  </div>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                          <Pagination
                            simple
                            current={auditPage}
                            pageSize={mobilePageSize}
                            total={auditLogs.length}
                            onChange={setAuditPage}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
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
                <>
                  {/* Desktop Table */}
                  <div className="attempt-table-desktop">
                    <Table
                      dataSource={loginAttempts}
                      columns={attemptColumns}
                      rowKey="id"
                      pagination={{ pageSize: 12 }}
                      scroll={{ x: 750 }}
                    />
                  </div>

                  {/* Mobile Card List */}
                  <div className="attempt-card-list">
                    {loginAttempts.length === 0 ? (
                      <Empty description="No login attempt records found" style={{ padding: '24px 0' }} />
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {paginatedLoginAttempts.map((att) => (
                            <Card
                              key={att.id}
                              size="small"
                              style={{
                                borderRadius: 12,
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <Text strong style={{ fontSize: 14 }}>
                                  {att.employee_code || <Text type="secondary">Unknown Employee</Text>}
                                </Text>
                                <Tag color={att.event_type === 'SUCCESS' ? 'green' : 'red'} style={{ fontWeight: 600 }}>
                                  {att.event_type}
                                </Tag>
                              </div>

                              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 10 }}>
                                {dayjs(att.created_at).format('MMM DD, YYYY hh:mm:ss A')}
                              </div>

                              <div
                                style={{
                                  background: '#f9fafb',
                                  borderRadius: 8,
                                  padding: '8px 10px',
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: '8px 12px',
                                  fontSize: 12,
                                }}
                              >
                                <div>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Network IP</Text>
                                  <Text>{att.ip_address || '127.0.0.1'}</Text>
                                </div>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Reported Distance</Text>
                                  <Text>{att.distance_meters !== null ? `${Math.round(att.distance_meters)}m` : '--'}</Text>
                                </div>
                              </div>

                              {att.failure_reason && (
                                <div style={{ marginTop: 8, padding: '6px 8px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                                  <Text type="danger" style={{ fontSize: 11, fontWeight: 500 }}>
                                    Failure: {att.failure_reason}
                                  </Text>
                                </div>
                              )}

                              {att.user_agent && (
                                <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af', wordBreak: 'break-all' }}>
                                  {att.user_agent}
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                          <Pagination
                            simple
                            current={attemptPage}
                            pageSize={mobilePageSize}
                            total={loginAttempts.length}
                            onChange={setAttemptPage}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
