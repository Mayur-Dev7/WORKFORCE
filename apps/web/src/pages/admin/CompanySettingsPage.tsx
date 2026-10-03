import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  TimePicker,
  InputNumber,
  Input,
  Checkbox,
  Button,
  Typography,
  Divider,
  Row,
  Col,
  Modal,
  Alert,
  message,
  Spin,
  Space,
} from 'antd';
import {
  SettingOutlined,
  SaveOutlined,
  WarningOutlined,
  ExportOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { CompanySettings, ApiResponse } from '@workforce/shared';

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

export const CompanySettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);

  const [form] = Form.useForm();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<CompanySettings>>('/company/settings');
      if (res.data.success && res.data.data) {
        const s = res.data.data;
        form.setFieldsValue({
          work_start_time: s.work_start_time ? dayjs(s.work_start_time, 'HH:mm') : dayjs('09:00', 'HH:mm'),
          work_end_time: s.work_end_time ? dayjs(s.work_end_time, 'HH:mm') : dayjs('18:00', 'HH:mm'),
          grace_minutes: s.grace_minutes ?? 15,
          timezone: s.timezone || 'UTC',
          weekly_off_days: s.weekly_off_days || [0, 6],
          casual_leaves_per_year: s.casual_leaves_per_year ?? 12,
          sick_leaves_per_year: s.sick_leaves_per_year ?? 12,
          leave_year_start_month: s.leave_year_start_month ?? 1,
        });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to load company settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (values: any) => {
    try {
      setSaving(true);
      const payload = {
        work_start_time: values.work_start_time.format('HH:mm'),
        work_end_time: values.work_end_time.format('HH:mm'),
        grace_minutes: values.grace_minutes,
        timezone: values.timezone,
        weekly_off_days: values.weekly_off_days,
        casual_leaves_per_year: values.casual_leaves_per_year,
        sick_leaves_per_year: values.sick_leaves_per_year,
        leave_year_start_month: values.leave_year_start_month,
      };

      const res = await api.put<ApiResponse<CompanySettings>>('/company/settings', payload);
      if (res.data.success) {
        message.success('Company settings updated successfully');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmLeave = async () => {
    try {
      setLeaving(true);
      const res = await api.post<ApiResponse<any>>('/companies/leave');
      if (res.data.success) {
        message.success('You have left the company.');
        setLeaveModalVisible(false);
        await refreshUser();
        navigate('/onboarding', { replace: true });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to leave company');
    } finally {
      setLeaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <SettingOutlined style={{ marginRight: 8, color: '#0284c7' }} />
          Company Settings & Policies
        </Title>
        <Text type="secondary">
          Configure work timings, weekend schedules, and annual leave allocations for {user?.company_name || 'your company'}.
        </Text>
      </div>

      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>Attendance & Schedule Configuration</span>
          </Space>
        }
        style={{ borderRadius: 12, marginBottom: 24, border: '1px solid #e2e8f0' }}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Standard Work Start Time"
                name="work_start_time"
                rules={[{ required: true }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Standard Work End Time"
                name="work_end_time"
                rules={[{ required: true }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Grace Period (Minutes)"
                name="grace_minutes"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Company Timezone" name="timezone" rules={[{ required: true }]}>
                <Input placeholder="e.g. Asia/Kolkata or America/New_York" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Leave Year Start Month (1 = Jan)"
                name="leave_year_start_month"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Weekly Off Days"
            name="weekly_off_days"
            rules={[{ required: true, message: 'Please select weekly off days' }]}
          >
            <Checkbox.Group options={DAY_OPTIONS} />
          </Form.Item>

          <Divider orientation="left" plain>
            Annual Leave Entitlement (Days)
          </Divider>

          <Row gutter={16}>
            <Col xs={12} sm={8}>
              <Form.Item
                label="Casual Leaves / Year"
                name="casual_leaves_per_year"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                label="Sick Leaves / Year"
                name="sick_leaves_per_year"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginTop: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              size="large"
            >
              Save Changes
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Danger Zone: Leave Company */}
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#ef4444' }} />
            <span style={{ color: '#b91c1c' }}>Danger Zone</span>
          </Space>
        }
        style={{
          borderRadius: 12,
          border: '1px solid #fecaca',
          background: '#fffbfb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <Text strong style={{ fontSize: 15, display: 'block' }}>
              Leave Company
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Detach your account from {user?.company_name || 'this organization'}. Pending leaves will be canceled, active attendance closed, and face enrollment removed.
            </Text>
          </div>

          <Button
            danger
            icon={<ExportOutlined />}
            onClick={() => setLeaveModalVisible(true)}
          >
            Leave Company
          </Button>
        </div>
      </Card>

      {/* Leave Confirmation Modal */}
      <Modal
        title="Leave Company Confirmation"
        open={leaveModalVisible}
        onCancel={() => setLeaveModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setLeaveModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="confirm"
            danger
            type="primary"
            loading={leaving}
            onClick={handleConfirmLeave}
          >
            Yes, Leave Company
          </Button>,
        ]}
      >
        <Alert
          type="error"
          showIcon
          message="This action will detach you immediately"
          description={
            <div>
              <p>When you leave:</p>
              <ul>
                <li>Your access to this company data will stop immediately.</li>
                <li>Any pending leave requests will be canceled.</li>
                <li>Any open attendance session will be safely closed.</li>
                <li>Your face biometric template will be deleted.</li>
                <li>
                  <strong>Note:</strong> If you are the sole administrator of this company, you cannot leave until another active Company Admin is assigned.
                </li>
              </ul>
            </div>
          }
        />
      </Modal>
    </div>
  );
};
export default CompanySettingsPage;
