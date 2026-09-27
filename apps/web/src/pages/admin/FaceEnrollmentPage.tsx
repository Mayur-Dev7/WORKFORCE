import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Alert,
  Typography,
  Tag,
  Divider,
  Steps,
  Progress,
  message,
  Space,
} from 'antd';
import {
  CameraOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  SafetyCertificateOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { api } from '../../services/api.js';
import { analyzeVideoFrame } from '../../services/face.client.js';
import { User, ApiResponse } from '@workforce/shared';

const { Title, Text, Paragraph } = Typography;

export const FaceEnrollmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Guided enrollment steps
  // 0: Position face, 1: Look straight, 2: Turn slightly left, 3: Turn slightly right, 4: Done
  const [currentStep, setCurrentStep] = useState(0);
  const [samples, setSamples] = useState<number[][]>([]);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guideMessage, setGuideMessage] = useState('Position your face inside the oval frame');

  // Live detection metrics
  const [faceDetected, setFaceDetected] = useState(false);
  const [qualityScore, setQualityScore] = useState(0);
  const [lastEmbedding, setLastEmbedding] = useState<number[]>([]);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await api.get<ApiResponse<User>>(`/users/${id}`);
        setTargetUser(res.data.data);
      } catch {
        message.error('Failed to load user details');
      } finally {
        setLoadingUser(false);
      }
    }
    fetchUser();
  }, [id]);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        if (active) {
          setStream(media);
          if (videoRef.current) {
            videoRef.current.srcObject = media;
            videoRef.current.play().catch(console.error);
            setCameraReady(true);
          }
        }
      } catch (err: any) {
        message.error(`Camera permission denied: ${err.message}`);
      }
    }

    startCamera();

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Frame processing loop
  useEffect(() => {
    let animId: number;
    let count = 0;

    const loop = async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && cameraReady) {
        count++;
        if (count % 8 === 0) {
          const detection = await analyzeVideoFrame(videoRef.current);
          if (detection.faceCount === 1) {
            setFaceDetected(true);
            setQualityScore(detection.quality);
            setLastEmbedding(detection.embedding);
          } else {
            setFaceDetected(false);
          }
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [cameraReady]);

  // Capture sample at step
  const handleCaptureSample = () => {
    if (!faceDetected || lastEmbedding.length === 0) {
      message.warning('Please align your face properly in the frame');
      return;
    }

    setCapturing(true);
    const updated = [...samples, lastEmbedding];
    setSamples(updated);

    if (currentStep === 0) {
      setCurrentStep(1);
      setGuideMessage('Great! Now look directly straight ahead and hold still.');
    } else if (currentStep === 1) {
      setCurrentStep(2);
      setGuideMessage('Nice! Now turn your face slightly to the left.');
    } else if (currentStep === 2) {
      setCurrentStep(3);
      setGuideMessage('Perfect! Now turn your face slightly to the right.');
    } else if (currentStep === 3) {
      setCurrentStep(4);
      setGuideMessage('All poses captured! Ready to finalize and create biometric template.');
    }

    setCapturing(false);
  };

  const handleReset = () => {
    setSamples([]);
    setCurrentStep(0);
    setGuideMessage('Position your face inside the oval frame');
  };

  const handleFinalizeEnrollment = async () => {
    if (samples.length === 0) return;
    setSubmitting(true);

    try {
      // Average the captured embedding vectors for a robust, normalized template
      const dim = samples[0].length;
      const avgVector: number[] = new Array(dim).fill(0);
      for (const s of samples) {
        for (let i = 0; i < dim; i++) {
          avgVector[i] += s[i];
        }
      }
      const len = samples.length;
      const normalizedVector = avgVector.map((val) => Number((val / len).toFixed(6)));

      await api.post(`/users/${id}/enroll-face`, {
        embedding: normalizedVector,
        modelName: '@vladmandic/human',
        modelVersion: '3.2.0',
      });

      message.success('Biometric face template enrolled and stored successfully!');
      if (stream) stream.getTracks().forEach((t) => t.stop());
      navigate('/admin/users');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save biometric template');
    } finally {
      setSubmitting(false);
    }
  };

  const stepItems = [
    { title: 'Position' },
    { title: 'Straight' },
    { title: 'Turn Left' },
    { title: 'Turn Right' },
    { title: 'Complete' },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/admin/users')}
        style={{ marginBottom: 16 }}
      >
        Back to Employees
      </Button>

      <Card style={{ borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Biometric Face Enrollment
            </Title>
            <Text type="secondary">
              Enrolling profile for{' '}
              <strong>
                {targetUser?.name} ({targetUser?.employee_code})
              </strong>
            </Text>
          </div>
          {targetUser?.face_enrolled && (
            <Tag color="orange" style={{ padding: '4px 10px', fontSize: 13 }}>
              Replacing Existing Face Template
            </Tag>
          )}
        </div>

        <Divider style={{ margin: '16px 0 24px' }} />

        {/* Guided Steps Progress */}
        <Steps current={currentStep} items={stepItems} style={{ marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          {/* Camera Container */}
          <div>
            <div className="camera-container">
              <video ref={videoRef} playsInline muted className="camera-video" />
              <div className={`face-guide-overlay ${faceDetected ? 'detected' : ''}`} />
              <div className="camera-status-badge">
                <Tag color={cameraReady ? 'success' : 'default'}>
                  {cameraReady ? 'Enrollment Camera Ready' : 'Loading...'}
                </Tag>
              </div>
              <div className="liveness-instruction-box">{guideMessage}</div>
            </div>
          </div>

          {/* Right Panel */}
          <div>
            <Card
              size="small"
              title="Pose Calibration & Quality"
              style={{ background: '#fafafa', borderRadius: 12, height: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="status-step-item">
                  {faceDetected ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Single Face Detected</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {faceDetected ? `Quality: ${(qualityScore * 100).toFixed(0)}%` : 'Align face in oval'}
                    </Text>
                  </div>
                </div>

                <div>
                  <Text strong>Samples Captured ({samples.length} / 4)</Text>
                  <Progress percent={(samples.length / 4) * 100} size="small" />
                </div>
              </div>

              <Divider style={{ margin: '20px 0' }} />

              {currentStep < 4 ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<CameraOutlined />}
                    disabled={!faceDetected || capturing}
                    onClick={handleCaptureSample}
                    style={{ height: 48 }}
                  >
                    Capture Pose {currentStep + 1}
                  </Button>
                  {samples.length > 0 && (
                    <Button block icon={<ReloadOutlined />} onClick={handleReset}>
                      Restart Calibration
                    </Button>
                  )}
                </Space>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<SafetyCertificateOutlined />}
                    loading={submitting}
                    onClick={handleFinalizeEnrollment}
                    style={{ height: 48, background: '#16a34a', borderColor: '#16a34a' }}
                  >
                    Save & Store Face Profile
                  </Button>
                  <Button block icon={<ReloadOutlined />} onClick={handleReset}>
                    Retake Samples
                  </Button>
                </Space>
              )}
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
};
