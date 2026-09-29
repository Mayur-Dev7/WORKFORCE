import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Segmented,
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
  Badge,
  Tooltip,
} from 'antd';
import {
  UploadOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  SyncOutlined,
  InboxOutlined,
  IdcardOutlined,
  ArrowRightOutlined,
  RedoOutlined,
  SafetyCertificateOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import {
  analyzeImageFile,
  analyzeVideoFrame,
  captureVideoFrameAsBase64,
  buildCentroidTemplate,
} from '../../services/face.client.js';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

interface FaceSample {
  id: string;
  previewUrl: string;
  embedding: number[];
  quality: number;
  label: string;
}

const GUIDED_POSES = [
  { step: 1, title: 'Frontal Neutral', desc: 'Look directly at camera with a natural, relaxed expression' },
  { step: 2, title: 'Frontal Smile', desc: 'Look directly at camera with a slight natural smile' },
  { step: 3, title: 'Turn Slightly Left', desc: 'Turn head ~15° to your left so right cheek is visible' },
  { step: 4, title: 'Turn Slightly Right', desc: 'Turn head ~15° to your right so left cheek is visible' },
  { step: 5, title: 'Slight Tilt Up/Down', desc: 'Tilt your chin slightly up or down to capture vertical angle' },
];

export const SelfEnrollmentPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Current enrolled face
  const [currentReferenceFace, setCurrentReferenceFace] = useState<string | null>(null);
  const [loadingCurrentFace, setLoadingCurrentFace] = useState(false);

  // Uploaded samples (up to 5 photos)
  const [uploadSamples, setUploadSamples] = useState<FaceSample[]>([]);
  const [uploadProcessing, setUploadProcessing] = useState(false);

  // Guided camera samples (up to 5 poses)
  const [cameraSamples, setCameraSamples] = useState<FaceSample[]>([]);
  const [currentPoseIdx, setCurrentPoseIdx] = useState(0);

  // Camera video stream
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live face detection feedback on camera
  const [liveFaceDetected, setLiveFaceDetected] = useState(false);
  const [liveQuality, setLiveQuality] = useState(0);
  const [capturingPose, setCapturingPose] = useState(false);

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

  // Clean up camera stream on unmount
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
    setCameraReady(false);
    setLiveFaceDetected(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });
      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera access failed:', err);
      setCameraError('Unable to access camera. Please check permissions or upload photos instead.');
    }
  };

  // Re-bind stream if videoRef mounts while cameraActive
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
      setCameraReady(true);
    }
  }, [cameraActive]);

  // Live face detection loop for camera
  useEffect(() => {
    let animId: number;
    let frameCounter = 0;

    const checkFrame = async () => {
      if (
        videoRef.current &&
        videoRef.current.readyState === 4 &&
        cameraReady &&
        cameraActive
      ) {
        frameCounter++;
        // Run inference every 6 frames to keep mobile UI super smooth
        if (frameCounter % 6 === 0) {
          try {
            const detection = await analyzeVideoFrame(videoRef.current);
            if (detection.faceCount === 1) {
              setLiveFaceDetected(true);
              setLiveQuality(detection.quality);
            } else {
              setLiveFaceDetected(false);
            }
          } catch {
            setLiveFaceDetected(false);
          }
        }
      }
      animId = requestAnimationFrame(checkFrame);
    };

    if (cameraActive && cameraReady) {
      animId = requestAnimationFrame(checkFrame);
    }
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, cameraReady]);

  // Tab switch handler
  const handleTabChange = (key: string) => {
    if (key === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    setActiveTab(key as 'upload' | 'camera');
  };

  // ---------------------------------------------------------------------------
  // Upload Handler (Supports multiple files up to 5)
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (file: File) => {
    if (uploadSamples.length >= 5) {
      message.warning('Maximum of 5 photos reached. Remove a photo to upload another.');
      return false;
    }

    setUploadProcessing(true);
    setStatusMessage('Checking image format & converting HEIC/JPG...');

    try {
      const result = await analyzeImageFile(file, (msg) => setStatusMessage(msg));
      const newSample: FaceSample = {
        id: `upload-${Date.now()}-${Math.random()}`,
        previewUrl: result.previewUrl,
        embedding: result.embedding,
        quality: Math.round(result.quality * 100),
        label: `Photo ${uploadSamples.length + 1} (${result.converted ? 'Converted JPG' : 'JPG'})`,
      };

      setUploadSamples((prev) => {
        const next = [...prev, newSample].slice(0, 5);
        return next;
      });

      if (result.converted) {
        message.success('Mobile HEIC photo converted to JPG and face detected!');
      } else {
        message.success('Face detected in uploaded image!');
      }
      setStatusMessage(null);
    } catch (err: any) {
      message.error(err.message || 'Failed to detect face in photo');
      setStatusMessage(null);
    } finally {
      setUploadProcessing(false);
    }

    return false; // Prevent automatic antd upload POST
  };

  const handleRemoveUploadSample = (id: string) => {
    setUploadSamples((prev) => prev.filter((s) => s.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Guided Camera Poses Handler (Capture 3 to 5 guided poses)
  // ---------------------------------------------------------------------------
  const handleCapturePose = async () => {
    if (!videoRef.current || !cameraActive) return;

    setCapturingPose(true);
    try {
      const detection = await analyzeVideoFrame(videoRef.current);
      if (detection.faceCount === 0) {
        message.warning('No face detected. Please position your face clearly in the oval frame.');
        setCapturingPose(false);
        return;
      }
      if (detection.faceCount > 1) {
        message.warning('Multiple faces detected. Please ensure only one person is in frame.');
        setCapturingPose(false);
        return;
      }

      const previewBase64 = captureVideoFrameAsBase64(videoRef.current);
      const poseInfo = GUIDED_POSES[currentPoseIdx] || { title: `Pose ${cameraSamples.length + 1}` };

      const newSample: FaceSample = {
        id: `camera-pose-${currentPoseIdx + 1}-${Date.now()}`,
        previewUrl: previewBase64,
        embedding: detection.embedding,
        quality: Math.round(detection.quality * 100),
        label: `Pose ${currentPoseIdx + 1}: ${poseInfo.title}`,
      };

      const updated = [...cameraSamples, newSample];
      setCameraSamples(updated);
      message.success(`Captured ${poseInfo.title}! (${updated.length}/5 poses)`);

      if (currentPoseIdx < GUIDED_POSES.length - 1) {
        setCurrentPoseIdx((prev) => prev + 1);
      }
    } catch (err: any) {
      message.error('Failed to capture pose from camera');
    } finally {
      setCapturingPose(false);
    }
  };

  const handleResetCameraPoses = () => {
    setCameraSamples([]);
    setCurrentPoseIdx(0);
  };

  // ---------------------------------------------------------------------------
  // Build Centroid Template & Submit Enrollment
  // ---------------------------------------------------------------------------
  const handleSaveEnrollment = async (samplesToSave: FaceSample[]) => {
    if (samplesToSave.length === 0) {
      message.error('Please capture or upload at least 1 face photo (3 to 5 recommended).');
      return;
    }

    setSubmitting(true);
    try {
      // Average all embeddings into single normalized centroid vector
      const centroidEmbedding = buildCentroidTemplate(samplesToSave.map((s) => s.embedding));
      const primaryPhoto = samplesToSave[0].previewUrl;

      await api.post('/users/self/enroll-face', {
        embedding: centroidEmbedding,
        modelName: '@vladmandic/human',
        modelVersion: '3.2.0',
        referenceImage: primaryPhoto,
      });

      message.success(
        `Successfully enrolled ${samplesToSave.length}-pose centroid biometric template! Check-in will now match smoothly across expressions and angles.`
      );
      stopCamera();
      await refreshUser();
      navigate('/employee/attendance/check-in');
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save biometric template');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPose = GUIDED_POSES[currentPoseIdx] || GUIDED_POSES[0];

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '10px 8px 30px' }}>
      <Card
        style={{ borderRadius: 16, overflow: 'hidden' }}
        bodyStyle={{ padding: '16px 14px' }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Header */}
          <div>
            <Title level={4} style={{ margin: '0 0 4px', fontSize: 18 }}>
              <IdcardOutlined style={{ marginRight: 8, color: '#1677ff' }} />
              Biometric Face Registration
            </Title>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4, display: 'block' }}>
              Enroll <strong>1 to 5 face photos</strong> to create your reference template for biometric attendance verification.
            </Text>
          </div>

          {/* Current Enrolled Status Banner */}
          {user?.face_enrolled ? (
            <Alert
              type="success"
              showIcon
              message={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text strong style={{ fontSize: 13 }}>Reference Face Active</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Your biometric identity is registered. You can update your reference photos below anytime.
                  </Text>
                  <div>
                    <Button
                      type="primary"
                      size="small"
                      icon={<ArrowRightOutlined />}
                      onClick={() => navigate('/employee/attendance/check-in')}
                    >
                      Go to Check-In
                    </Button>
                  </div>
                </div>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Action Required: Reference Face Missing"
              description="Please upload or capture your photo to enable attendance check-in."
            />
          )}

          {/* Currently Stored Reference Face Card */}
          {currentReferenceFace && (
            <Card
              size="small"
              style={{ background: '#f6ffed', borderColor: '#b7eb8f', borderRadius: 12 }}
              bodyStyle={{ padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar
                  shape="square"
                  size={56}
                  src={currentReferenceFace}
                  style={{ border: '2px solid #52c41a', objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 14 }}>{user?.name}</Text>
                    <Tag color="success" style={{ margin: 0, fontSize: 11 }}>Active ✓</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                    {user?.employee_code} • {user?.office_name || 'Assigned Office'}
                  </Text>
                  <Tag color="blue" style={{ fontSize: 10, marginTop: 4 }}>1024-D Centroid Active</Tag>
                </div>
              </div>
            </Card>
          )}

          <Divider style={{ margin: '4px 0 8px' }} />

          {/* Mode Switcher: Mobile Segmented Control */}
          <Segmented
            block
            size="large"
            value={activeTab}
            onChange={(val) => handleTabChange(val as 'upload' | 'camera')}
            options={[
              {
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13 }}>
                    <UploadOutlined /> Upload Photos (1–5)
                  </span>
                ),
                value: 'upload',
              },
              {
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13 }}>
                    <CameraOutlined /> Use Camera (3–5)
                  </span>
                ),
                value: 'camera',
              },
            ]}
          />

          {/* =============================================================== */}
          {/* TAB 1: UPLOAD PHOTOS */}
          {/* =============================================================== */}
          {activeTab === 'upload' && (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Dragger
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
                multiple={true}
                showUploadList={false}
                beforeUpload={handleFileUpload}
                disabled={uploadSamples.length >= 5 || uploadProcessing}
                style={{ padding: '16px 8px', borderRadius: 12, background: '#fafafa' }}
              >
                <p className="ant-upload-drag-icon" style={{ margin: '0 0 6px' }}>
                  <InboxOutlined style={{ fontSize: 36, color: '#1677ff' }} />
                </p>
                <p className="ant-upload-text" style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>
                  Tap to Select or Take Face Photos
                </p>
                <p className="ant-upload-hint" style={{ fontSize: 12, margin: '0 0 8px', color: '#6b7280' }}>
                  Select 1 to 5 clear photos. Supports JPG, PNG, WEBP & HEIC.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Tag color="cyan" style={{ fontSize: 11, margin: 0, maxWidth: '95%', whiteSpace: 'normal', height: 'auto', padding: '3px 8px' }}>
                    Auto Mobile Photo & HEIC Converter Active
                  </Tag>
                </div>
              </Dragger>

              {statusMessage && (
                <Alert
                  type="info"
                  showIcon
                  icon={<SyncOutlined spin />}
                  message={statusMessage}
                />
              )}

              {/* Upload Samples Gallery */}
              {uploadSamples.length > 0 && (
                <Card
                  size="small"
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space size="small">
                        <Text strong style={{ fontSize: 13 }}>Selected ({uploadSamples.length}/5)</Text>
                        {uploadSamples.length >= 3 ? (
                          <Tag color="success">Optimal Count</Tag>
                        ) : (
                          <Tag color="blue">{uploadSamples.length} Photo{uploadSamples.length > 1 ? 's' : ''}</Tag>
                        )}
                      </Space>
                      <Button size="small" type="text" danger onClick={() => setUploadSamples([])}>
                        Clear
                      </Button>
                    </div>
                  }
                  style={{ background: '#fafafa', borderRadius: 12 }}
                  bodyStyle={{ padding: 10 }}
                >
                  <Row gutter={[8, 8]}>
                    {uploadSamples.map((sample, idx) => (
                      <Col xs={12} sm={8} md={6} key={sample.id}>
                        <div
                          style={{
                            position: 'relative',
                            border: '2px solid #1677ff',
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#000',
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={sample.previewUrl}
                            alt={sample.label}
                            style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
                          />
                          <div style={{ position: 'absolute', top: 4, right: 4 }}>
                            <Button
                              size="small"
                              danger
                              type="primary"
                              shape="circle"
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveUploadSample(sample.id)}
                            />
                          </div>
                          <div
                            style={{
                              padding: '3px 4px',
                              background: 'rgba(0,0,0,0.7)',
                              color: '#fff',
                              fontSize: 10,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {idx === 0 ? 'Primary' : `Photo ${idx + 1}`} • Q: {sample.quality}%
                          </div>
                        </div>
                      </Col>
                    ))}
                  </Row>

                  <div style={{ marginTop: 14 }}>
                    <Button
                      type="primary"
                      size="large"
                      block
                      icon={<SafetyCertificateOutlined />}
                      loading={submitting}
                      disabled={uploadSamples.length === 0}
                      onClick={() => handleSaveEnrollment(uploadSamples)}
                      style={{
                        height: 48,
                        fontSize: 15,
                        fontWeight: 600,
                        borderRadius: 8,
                        background: '#16a34a',
                        borderColor: '#16a34a',
                      }}
                    >
                      Save Biometric Template ({uploadSamples.length} Photo{uploadSamples.length > 1 ? 's' : ''})
                    </Button>
                  </div>
                </Card>
              )}

              <div style={{ textAlign: 'center', marginTop: 2 }}>
                <Button
                  type="link"
                  icon={<CameraOutlined />}
                  onClick={() => handleTabChange('camera')}
                  style={{ fontSize: 13 }}
                >
                  Or take guided poses with your camera →
                </Button>
              </div>
            </Space>
          )}

          {/* =============================================================== */}
          {/* TAB 2: GUIDED CAMERA POSES */}
          {/* =============================================================== */}
          {activeTab === 'camera' && (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {cameraError && <Alert type="error" message={cameraError} showIcon />}

              {/* Progress of Poses */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    Step {Math.min(currentPoseIdx + 1, 5)} of 5: {currentPose.title}
                  </Text>
                  <Tag color={cameraSamples.length >= 3 ? 'success' : 'blue'}>
                    {cameraSamples.length}/5 Captured
                  </Tag>
                </div>
                <Progress
                  percent={(cameraSamples.length / 5) * 100}
                  status={cameraSamples.length >= 3 ? 'success' : 'active'}
                  strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
                />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                  {currentPose.desc}
                </Text>
              </div>

              {/* Camera Viewport with Oval Face Guide */}
              <div className="camera-container" style={{ maxHeight: 340 }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="camera-video"
                />

                <div className={`face-guide-overlay ${liveFaceDetected ? 'detected' : ''}`} />

                <div className="camera-status-badge">
                  <Tag color={liveFaceDetected ? 'success' : 'default'} style={{ fontSize: 11 }}>
                    {liveFaceDetected ? `Face Detected (${(liveQuality * 100).toFixed(0)}%)` : 'Align Face in Oval'}
                  </Tag>
                </div>

                <div className="liveness-instruction-box">
                  {liveFaceDetected
                    ? `Ready for ${currentPose.title} — Tap Capture`
                    : 'Position your face inside the oval guide'}
                </div>
              </div>

              {/* Capture Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CameraOutlined />}
                  disabled={!cameraActive || !liveFaceDetected || capturingPose || cameraSamples.length >= 5}
                  loading={capturingPose}
                  onClick={handleCapturePose}
                  style={{ height: 48, fontSize: 15, fontWeight: 600, borderRadius: 8 }}
                >
                  Capture Pose {Math.min(currentPoseIdx + 1, 5)} ({currentPose.title})
                </Button>

                <div style={{ display: 'flex', gap: 8 }}>
                  {cameraSamples.length > 0 && (
                    <Button
                      icon={<RedoOutlined />}
                      onClick={handleResetCameraPoses}
                      style={{ flex: 1, height: 38 }}
                    >
                      Restart
                    </Button>
                  )}
                  <Button onClick={stopCamera} style={{ flex: 1, height: 38 }}>
                    Close Camera
                  </Button>
                </div>
              </div>

              {/* Captured Poses Thumbnails Row */}
              {cameraSamples.length > 0 && (
                <Card
                  size="small"
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space size="small">
                        <Text strong style={{ fontSize: 13 }}>Captured ({cameraSamples.length}/5)</Text>
                        {cameraSamples.length >= 3 ? (
                          <Tag color="success">Ready (3+ poses)</Tag>
                        ) : (
                          <Tag color="warning">Need 3+ poses</Tag>
                        )}
                      </Space>
                    </div>
                  }
                  style={{ background: '#fafafa', borderRadius: 12 }}
                  bodyStyle={{ padding: 10 }}
                >
                  <Row gutter={[6, 6]}>
                    {cameraSamples.map((sample) => (
                      <Col xs={8} sm={6} md={4} key={sample.id}>
                        <div
                          style={{
                            border: '2px solid #52c41a',
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#000',
                            textAlign: 'center',
                          }}
                        >
                          <img
                            src={sample.previewUrl}
                            alt={sample.label}
                            style={{ width: '100%', height: 75, objectFit: 'cover', display: 'block' }}
                          />
                          <div
                            style={{
                              padding: '2px 4px',
                              background: 'rgba(0,0,0,0.7)',
                              color: '#fff',
                              fontSize: 9,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {sample.label}
                          </div>
                        </div>
                      </Col>
                    ))}
                  </Row>

                  <div style={{ marginTop: 14 }}>
                    <Button
                      type="primary"
                      size="large"
                      block
                      icon={<SafetyCertificateOutlined />}
                      loading={submitting}
                      disabled={cameraSamples.length < 3}
                      onClick={() => handleSaveEnrollment(cameraSamples)}
                      style={{
                        height: 48,
                        fontSize: 15,
                        fontWeight: 600,
                        borderRadius: 8,
                        background: cameraSamples.length >= 3 ? '#16a34a' : undefined,
                        borderColor: cameraSamples.length >= 3 ? '#16a34a' : undefined,
                      }}
                    >
                      Confirm & Save Template ({cameraSamples.length} Poses)
                    </Button>
                  </div>
                </Card>
              )}
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
};
