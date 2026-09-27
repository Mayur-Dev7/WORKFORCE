import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Upload,
  Button,
  Alert,
  Space,
  Progress,
  message,
  Divider,
  Avatar,
  Row,
  Col,
  Tag,
} from 'antd';
import {
  UploadOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  InboxOutlined,
  IdcardOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import {
  analyzeImageFile,
  analyzeVideoFrame,
  captureVideoFrameAsBase64,
} from '../../services/face.client.js';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

export const SelfEnrollmentPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Current enrolled face
  const [currentReferenceFace, setCurrentReferenceFace] = useState<string | null>(null);
  const [loadingCurrentFace, setLoadingCurrentFace] = useState(false);

  // Staged data ready for submission
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [stagedEmbedding, setStagedEmbedding] = useState<number[] | null>(null);
  const [stagedQuality, setStagedQuality] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch current enrolled face if user.face_enrolled is true
  useEffect(() => {
    if (user?.face_enrolled) {
      setLoadingCurrentFace(true);
      api
        .get('/users/self/face-template')
        .then((res) => {
          if (res.data?.data?.referenceImage) {
            setCurrentReferenceFace(res.data.data.referenceImage);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch existing face template', err);
        })
        .finally(() => setLoadingCurrentFace(false));
    }
  }, [user?.face_enrolled]);

  // Clean up camera stream on unmount or tab change
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError('Unable to access camera. Please check permissions or upload a photo instead.');
    }
  };

  const handleTabChange = (key: string) => {
    if (key !== 'camera') {
      stopCamera();
    }
    setActiveTab(key as 'upload' | 'camera');
  };

  // Upload handler
  const handleFileUpload = async (file: File) => {
    setAnalyzing(true);
    setStatusMessage('Analyzing photo and detecting face...');
    try {
      const result = await analyzeImageFile(file);
      setStagedPreview(result.previewUrl);
      setStagedEmbedding(result.embedding);
      setStagedQuality(Math.round(result.quality * 100));
      setStatusMessage('Face detected successfully! Review your photo and click Confirm to save.');
      message.success('Face detected in uploaded image!');
    } catch (err: any) {
      message.error(err.message || 'Failed to detect face. Please upload a clear photo.');
      setStatusMessage(null);
    } finally {
      setAnalyzing(false);
    }
    return false; // Prevent automatic upload by antd Dragger
  };

  // Camera capture handler
  const handleCaptureFromCamera = async () => {
    if (!videoRef.current) return;
    setAnalyzing(true);
    setStatusMessage('Analyzing camera capture...');
    try {
      const detection = await analyzeVideoFrame(videoRef.current);
      if (detection.faceCount === 0) {
        message.warning('No face detected. Please position your face clearly in the camera frame.');
        setAnalyzing(false);
        return;
      }

      const previewBase64 = captureVideoFrameAsBase64(videoRef.current);
      setStagedPreview(previewBase64);
      setStagedEmbedding(detection.embedding);
      setStagedQuality(Math.round(detection.quality * 100));
      setStatusMessage('Photo captured successfully! Review your photo and click Confirm to save.');
      message.success('Face captured successfully!');
      stopCamera();
    } catch (err: any) {
      message.error('Failed to capture face from camera.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Submit enrollment
  const handleSaveEnrollment = async () => {
    if (!stagedEmbedding || stagedEmbedding.length === 0) {
      message.error('Please upload or capture a valid face photo first.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/users/self/enroll-face', {
        embedding: stagedEmbedding,
        modelName: '@vladmandic/human',
        modelVersion: '3.2.0',
        referenceImage: stagedPreview,
      });

      await refreshUser();
      setCurrentReferenceFace(stagedPreview);
      message.success('Reference face registered successfully! You can now check in using face verification.');
      setStagedPreview(null);
      setStagedEmbedding(null);
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save face enrollment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              <IdcardOutlined style={{ marginRight: 8, color: '#1677ff' }} />
              Biometric Face Registration
            </Title>
            <Paragraph type="secondary">
              Upload or capture an official reference photo of your face. When checking in or out at your office,
              the live camera will verify your identity against this reference image.
            </Paragraph>
          </div>

          {user?.face_enrolled ? (
            <Alert
              type="success"
              showIcon
              message={
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Text strong>Reference Face Registered</Text>
                  <Text type="secondary">
                    Your biometric identity is active. You can check in at any time, or update your reference photo below if needed.
                  </Text>
                  <Button
                    type="primary"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate('/employee/attendance/check-in')}
                  >
                    Go to Attendance Check-In
                  </Button>
                </Space>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Action Required: Reference Face Missing"
              description="You have not enrolled a reference face yet. Attendance check-in requires a reference photo to match your live face at the office."
            />
          )}

          {currentReferenceFace && (
            <Card
              size="small"
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <Text strong>Currently Stored Reference Face</Text>
                  <Tag color="success">Active</Tag>
                </Space>
              }
              style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}
            >
              <Row gutter={16} align="middle">
                <Col>
                  <Avatar
                    shape="square"
                    size={96}
                    src={currentReferenceFace}
                    style={{ border: '2px solid #52c41a', objectFit: 'cover' }}
                  />
                </Col>
                <Col flex="auto">
                  <Text strong>{user?.name}</Text>
                  <br />
                  <Text type="secondary">Employee Code: {user?.employee_code}</Text>
                  <br />
                  <Text type="secondary">Office: {user?.office_name || 'San Francisco HQ'}</Text>
                  <br />
                  <Tag color="blue" style={{ marginTop: 6 }}>1024-D Biometric Embedding Stored</Tag>
                </Col>
              </Row>
            </Card>
          )}

          <Divider style={{ margin: '8px 0' }} />

          <Title level={4}>
            {user?.face_enrolled ? 'Update Reference Face Photo' : 'Enroll Your Face Photo'}
          </Title>

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              {
                key: 'upload',
                label: (
                  <span>
                    <UploadOutlined /> Upload Face Photo
                  </span>
                ),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Dragger
                      accept="image/*"
                      multiple={false}
                      showUploadList={false}
                      beforeUpload={handleFileUpload}
                      style={{ padding: 24 }}
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
                      </p>
                      <p className="ant-upload-text">
                        Click or drag a clear front-facing portrait photo here
                      </p>
                      <p className="ant-upload-hint">
                        Supports JPEG, PNG, WEBP. Ensure good lighting and look straight at the camera.
                      </p>
                    </Dragger>
                  </Space>
                ),
              },
              {
                key: 'camera',
                label: (
                  <span>
                    <CameraOutlined /> Use Camera
                  </span>
                ),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {cameraError && <Alert type="error" message={cameraError} showIcon />}

                    {!cameraActive ? (
                      <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <Button
                          type="primary"
                          icon={<CameraOutlined />}
                          size="large"
                          onClick={startCamera}
                        >
                          Start Web Camera
                        </Button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            position: 'relative',
                            display: 'inline-block',
                            borderRadius: 12,
                            overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          }}
                        >
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{
                              width: '100%',
                              maxWidth: 520,
                              height: 'auto',
                              transform: 'scaleX(-1)',
                              display: 'block',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '15%',
                              left: '25%',
                              width: '50%',
                              height: '70%',
                              border: '2px dashed rgba(255,255,255,0.75)',
                              borderRadius: '50%',
                              pointerEvents: 'none',
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <Space>
                            <Button
                              type="primary"
                              size="large"
                              icon={<CameraOutlined />}
                              onClick={handleCaptureFromCamera}
                              loading={analyzing}
                            >
                              Capture Photo
                            </Button>
                            <Button onClick={stopCamera}>Cancel Camera</Button>
                          </Space>
                        </div>
                      </div>
                    )}
                  </Space>
                ),
              },
            ]}
          />

          {/* Staged Preview Section */}
          {stagedPreview && (
            <Card
              title="Staged Photo Preview & Biometric Analysis"
              style={{ background: '#fafafa', borderColor: '#d9d9d9' }}
            >
              <Row gutter={24} align="middle">
                <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 12 }}>
                  <img
                    src={stagedPreview}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      borderRadius: 8,
                      border: '2px solid #1677ff',
                      objectFit: 'cover',
                    }}
                  />
                </Col>
                <Col xs={24} sm={16}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {statusMessage && <Text strong>{statusMessage}</Text>}
                    <div>
                      <Text type="secondary">Face Clarity & Quality:</Text>
                      <Progress
                        percent={stagedQuality}
                        status={stagedQuality >= 70 ? 'success' : 'normal'}
                      />
                    </div>
                    <Text type="secondary">
                      Embedding Vector: Generated 128-dimensional biometric template
                    </Text>

                    <Space style={{ marginTop: 12 }}>
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        size="large"
                        loading={submitting}
                        onClick={handleSaveEnrollment}
                      >
                        Confirm & Save Reference Face
                      </Button>
                      <Button
                        onClick={() => {
                          setStagedPreview(null);
                          setStagedEmbedding(null);
                          setStatusMessage(null);
                        }}
                      >
                        Discard
                      </Button>
                    </Space>
                  </Space>
                </Col>
              </Row>
            </Card>
          )}
        </Space>
      </Card>
    </div>
  );
};
