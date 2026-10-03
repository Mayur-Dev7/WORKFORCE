import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  Row,
  Col,
  TimePicker,
  Checkbox,
  InputNumber,
  Divider,
  Tag,
  message,
  Spin,
  Alert,
} from 'antd';
import {
  ShopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  MailOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { Invitation, ApiResponse } from '@workforce/shared';

const { Title, Text, Paragraph } = Typography;

const DAY_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
];

export const OnboardingPage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [submittingCompany, setSubmittingCompany] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const [form] = Form.useForm();

  // If user already belongs to a company, redirect to dashboard
  useEffect(() => {
    if (user?.company_id) {
      navigate('/employee/dashboard', { replace: true });
    }
  }, [user, navigate]);

  // Fetch pending invitations for this user's email
  const fetchInvitations = async () => {
    try {
      setLoadingInvitations(true);
      const res = await api.get<ApiResponse<Invitation[]>>('/invitations/mine');
      if (res.data.success && res.data.data) {
        setInvitations(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch pending invitations:', err);
    } finally {
      setLoadingInvitations(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      setActionInProgress(invitationId);
      const res = await api.post<ApiResponse<any>>(`/invitations/${invitationId}/accept`);
      if (res.data.success) {
        message.success('Invitation accepted! Welcome to the company.');
        await refreshUser();
        navigate('/employee/dashboard', { replace: true });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to accept invitation');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      setActionInProgress(invitationId);
      await api.post(`/invitations/${invitationId}/decline`);
      message.info('Invitation declined');
      await fetchInvitations();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to decline invitation');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateCompany = async (values: any) => {
    try {
      setSubmittingCompany(true);
      const payload = {
        name: values.company_name.trim(),
        officeName: values.office_name ? values.office_name.trim() : 'Headquarters',
        address: values.address ? values.address.trim() : undefined,
        work_start_time: values.work_start_time ? values.work_start_time.format('HH:mm') : '09:00',
        work_end_time: values.work_end_time ? values.work_end_time.format('HH:mm') : '18:00',
        weekly_off_days: values.weekly_off_days || [0, 6],
        casual_leaves_per_year: values.casual_leaves_per_year ?? 12,
        sick_leaves_per_year: values.sick_leaves_per_year ?? 12,
      };

      const res = await api.post<ApiResponse<any>>('/companies', payload);
      if (res.data.success) {
        message.success('Company created successfully! Welcome as Company Admin.');
        await refreshUser();
        navigate('/admin/dashboard', { replace: true });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to create company');
    } finally {
      setSubmittingCompany(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            padding: '16px 20px',
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: '#0284c7',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              <ShopOutlined />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, fontSize: 18 }}>
                Workforce Onboarding
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                <UserOutlined style={{ marginRight: 4 }} />
                {user?.name} ({user?.email})
              </Text>
            </div>
          </div>

          <Button
            icon={<LogoutOutlined />}
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign Out
          </Button>
        </div>

        {/* Pending Invitations Section */}
        {loadingInvitations ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 8, color: '#64748b' }}>Checking for company invitations...</div>
          </div>
        ) : invitations.length > 0 ? (
          <Card
            title={
              <Space>
                <MailOutlined style={{ color: '#0284c7' }} />
                <span>Pending Invitations ({invitations.length})</span>
              </Space>
            }
            style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <Alert
              message="You have been invited to join an existing organization"
              description="Accepting an invitation will connect your account and configure your permissions immediately."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    padding: 16,
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 16 }}>
                        {inv.company_name || 'Organization'}
                      </Text>
                      <Tag color="blue">{inv.role_name}</Tag>
                      {inv.department_name && <Tag color="cyan">{inv.department_name}</Tag>}
                      {inv.office_name && <Tag color="geekblue">{inv.office_name}</Tag>}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Invited by {inv.invited_by_name || 'Administrator'} • Expires{' '}
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </Text>
                  </div>

                  <Space>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      loading={actionInProgress === inv.id}
                      onClick={() => handleAcceptInvitation(inv.id)}
                    >
                      Accept & Join
                    </Button>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      loading={actionInProgress === inv.id}
                      onClick={() => handleDeclineInvitation(inv.id)}
                    >
                      Decline
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>

            <Divider style={{ margin: '24px 0 16px 0' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                OR
              </Text>
            </Divider>
          </Card>
        ) : null}

        {/* Create Your Company Section */}
        <Card
          title={
            <Space>
              <ShopOutlined style={{ color: '#0284c7' }} />
              <span>Create Your Organization</span>
            </Space>
          }
          style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
        >
          <Paragraph type="secondary">
            Set up your organization workspace. As the creator, you will automatically become the{' '}
            <Text strong>Company Admin</Text> with full permissions to manage offices, attendance rules,
            leave policies, and invite your team.
          </Paragraph>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleCreateCompany}
            initialValues={{
              company_name: '',
              office_name: 'Headquarters',
              work_start_time: dayjs('09:00', 'HH:mm'),
              work_end_time: dayjs('18:00', 'HH:mm'),
              weekly_off_days: [0, 6], // Sunday, Saturday
              casual_leaves_per_year: 12,
              sick_leaves_per_year: 12,
            }}
          >
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Company Name"
                  name="company_name"
                  rules={[{ required: true, message: 'Please enter company name' }]}
                >
                  <Input placeholder="e.g. Acme Corporation" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Primary Office / Location Name" name="office_name">
                  <Input placeholder="e.g. Headquarters" size="large" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Office Address" name="address">
              <Input placeholder="e.g. 100 Main Street, Suite 400" />
            </Form.Item>

            <Divider orientation="left" plain>
              <Space>
                <CalendarOutlined />
                <span>Work Timing & Schedule</span>
              </Space>
            </Divider>

            <Row gutter={16}>
              <Col xs={12} sm={8}>
                <Form.Item label="Work Start Time" name="work_start_time">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label="Work End Time" name="work_end_time">
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Weekly Off Days" name="weekly_off_days">
              <Checkbox.Group options={DAY_OPTIONS} />
            </Form.Item>

            <Divider orientation="left" plain>
              <span>Annual Leave Allowances</span>
            </Divider>

            <Row gutter={16}>
              <Col xs={12} sm={8}>
                <Form.Item label="Casual Leaves / Year" name="casual_leaves_per_year">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label="Sick Leaves / Year" name="sick_leaves_per_year">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginTop: 24 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={submittingCompany}
                block
                style={{ height: 48, fontSize: 16, fontWeight: 600 }}
              >
                Create Company & Continue
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
};
export default OnboardingPage;
