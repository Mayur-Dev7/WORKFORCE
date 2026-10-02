import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Card, Form, Input, Button, Typography, Alert, Space } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { getFirebaseAuth } from './firebaseClient.js';
import { resolveIdentifierToEmail } from './firebaseAuthAdapter.js';

const { Title, Text, Paragraph } = Typography;

export const ForgotPasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onFinish = async (values: { identifier: string }) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const auth = getFirebaseAuth();
      let email: string;

      try {
        email = await resolveIdentifierToEmail(values.identifier);
      } catch {
        // Even if identifier resolution fails, avoid leaking user existence
        setSubmitted(true);
        return;
      }

      const actionCodeSettings = {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      };

      try {
        await sendPasswordResetEmail(auth, email, actionCodeSettings);
      } catch (err: any) {
        if (err.code === 'auth/too-many-requests') {
          setErrorMsg('Too many attempts. Please try again later.');
          return;
        }
        // For security, do not reveal if user does not exist (auth/user-not-found)
        console.warn('Password reset notification notice:', err.code);
      }

      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to process reset request. Please try again later.');
    } finally {
      setLoading(false);
    }
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
          maxWidth: 460,
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical" align="center">
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 12,
                background: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 24,
              }}
            >
              <SafetyCertificateOutlined />
            </div>
            <Title level={3} style={{ margin: '8px 0 0' }}>
              Reset Password
            </Title>
            <Text type="secondary">
              Enter your work email or employee code to receive a reset link
            </Text>
          </Space>
        </div>

        {errorMsg && (
          <Alert
            message="Error"
            description={errorMsg}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMsg(null)}
            style={{ marginBottom: 20 }}
          />
        )}

        {submitted ? (
          <div>
            <Alert
              message="Password Reset Requested"
              description="If an account exists for that email or employee code, a password reset link has been sent. Please check your inbox and spam folder."
              type="success"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 13 }}>
              Follow the instructions in the email to choose a new password, then return to sign in.
            </Paragraph>
            <Button type="primary" block size="large" style={{ marginTop: 8 }}>
              <Link to="/login">Return to Login</Link>
            </Button>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="identifier"
              label="Corporate Email or Employee Code"
              rules={[{ required: true, message: 'Please enter your email or employee code!' }]}
            >
              <Input
                prefix={<MailOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                placeholder="e.g. alex@workforce.com or EMP-101"
                size="large"
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 24 }}>
              <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                Send Reset Link
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeftOutlined /> Back to Sign In
              </Link>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
};
