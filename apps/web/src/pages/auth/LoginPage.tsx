import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Alert,
  Divider,
  Tag,
  Space,
  Row,
  Col,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext.js';

const { Title, Text, Paragraph } = Typography;

export const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/employee/dashboard';

  const onFinish = async (values: any) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await login(values.identifier, values.password);
      if (user.role_name === 'SUPER_ADMIN' || user.role_name === 'HR_ADMIN') {
        navigate('/admin/dashboard');
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Login failed';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (identifier: string) => {
    form.setFieldsValue({
      identifier,
      password: 'Password123!',
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical" align="center">
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 12,
                background: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 28,
              }}
            >
              <SafetyCertificateOutlined />
            </div>
            <Title level={3} style={{ margin: '8px 0 0' }}>
              Workforce Access Portal
            </Title>
            <Text type="secondary">
              Biometric Face Verification & Office Geofence Access
            </Text>
          </Space>
        </div>

        {errorMsg && (
          <Alert
            message="Authentication Error"
            description={errorMsg}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMsg(null)}
            style={{ marginBottom: 20 }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ remember: true }}>
          <Form.Item
            name="identifier"
            label="Employee Code or Corporate Email"
            rules={[{ required: true, message: 'Please input your employee code or email!' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
              placeholder="e.g. EMP-101 or alex@workforce.com"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
              placeholder="••••••••••••"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Sign In to Workplace
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            DEVELOPMENT DEMO ACCOUNTS (Password: Password123!)
          </Text>
        </Divider>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            size="small"
            onClick={() => handleQuickFill('EMP-001')}
            style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Sarah Connor (Super Admin)</span>
            <Tag color="magenta">SUPER_ADMIN</Tag>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickFill('EMP-002')}
            style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Elena Ramos (HR Admin)</span>
            <Tag color="blue">HR_ADMIN</Tag>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickFill('EMP-003')}
            style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Marcus Vance (Manager)</span>
            <Tag color="orange">MANAGER</Tag>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickFill('EMP-101')}
            style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Alex Mercer (Face Enrolled Employee)</span>
            <Tag color="green">FACE READY</Tag>
          </Button>

          <Button
            size="small"
            onClick={() => handleQuickFill('EMP-102')}
            style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Jessica Chen (New Employee)</span>
            <Tag color="default">NO FACE YET</Tag>
          </Button>
        </div>
      </Card>
    </div>
  );
};
