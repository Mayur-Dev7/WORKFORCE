import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
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

const GoogleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 8, verticalAlign: 'middle' }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

export const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLegacyAuth = (import.meta.env.VITE_AUTH_PROVIDER || '').toLowerCase() === 'legacy';

  const from = (location.state as any)?.from?.pathname || '/employee/dashboard';

  const onFinish = async (values: any) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await login(values.identifier, values.password);
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Login failed';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    try {
      if (loginWithGoogle) {
        await loginWithGoogle();
        navigate(from, { replace: true });
      }
    } catch (err: any) {

      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }
      const msg = err.response?.data?.error?.message || err.message || 'Google sign-in failed';
      setErrorMsg(msg);
    } finally {
      setGoogleLoading(false);
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

        {!isLegacyAuth && (
          <>
            <Button
              size="large"
              block
              onClick={handleGoogleSignIn}
              loading={googleLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 44,
                borderRadius: 8,
                border: '1px solid #d9d9d9',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                fontWeight: 500,
                fontSize: 15,
                marginBottom: 20,
              }}
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </Button>

            <Divider style={{ margin: '0 0 20px 0' }}>
              <Text type="secondary" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                or sign in with password
              </Text>
            </Divider>
          </>
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

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14 }}>Password</Text>
              <Link to="/forgot-password" style={{ fontSize: 13, color: '#1677ff' }}>
                Forgot password?
              </Link>
            </div>
            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Please input your password!' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                placeholder="••••••••••••"
                size="large"
              />
            </Form.Item>
          </div>

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Sign In to Workplace
            </Button>
          </Form.Item>
        </Form>

        {import.meta.env.DEV && (
          <>
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
          </>
        )}
      </Card>
    </div>
  );
};



