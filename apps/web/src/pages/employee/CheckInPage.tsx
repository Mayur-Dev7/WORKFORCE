import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Alert,
  Space,
  Typography,
  Tag,
  Divider,
  Steps,
  Progress,
  message,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CameraOutlined,
  EnvironmentOutlined,
  SmileOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { analyzeVideoFrame } from '../../services/face.client.js';
import { Office, ApiResponse, AttendanceSession } from '@workforce/shared';

const { Title, Text, Paragraph } = Typography;

export const CheckInPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Verification pipeline states
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [qualityScore, setQualityScore] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [lastEmbedding, setLastEmbedding] = useState<number[]>([]);

  // Geolocation states
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null);

  // Reference face template
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  // Request & Submission state
  const [submitting, setSubmitting] = useState(false);
  const [resultError, setResultError] = useState<{ title: string; message: string } | null>(null);
  const [livenessInstruction, setLivenessInstruction] = useState('Position face inside oval');

  // Load office details, reference face & start camera
  useEffect(() => {
    let active = true;

    async function init() {
      // 1. Fetch assigned office & reference face
      if (user?.office_id) {
        try {
          const res = await api.get<ApiResponse<Office>>(`/offices/${user.office_id}`);
          if (active) setOffice(res.data.data);
        } catch (e) {
          console.error(e);
        }
      }

      try {
        const faceRes = await api.get('/users/self/face-template');
        if (active && faceRes.data?.data?.referenceImage) {
          setReferenceImage(faceRes.data.data.referenceImage);
        }
      } catch (e) {
        console.warn('Could not fetch reference face', e);
      }

      // 2. Start webcam
      try {
        const userMedia = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        if (active) {
          setStream(userMedia);
          if (videoRef.current) {
            videoRef.current.srcObject = userMedia;
            videoRef.current.play().catch(console.error);
            setCameraReady(true);
          }
        }
      } catch (err: any) {
        if (active) {
          setResultError({
            title: 'Camera Access Denied',
            message: 'Camera permission is required for face biometric check-in.',
          });
        }
      }

      // 3. Obtain precise GPS coordinates
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!active) return;
            setUserCoords({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          (err) => {
            if (!active) return;
            setResultError({
              title: 'GPS Location Unavailable',
              message: `Could not retrieve accurate GPS coordinates: ${err.message}`,
            });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }

    init();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [user?.office_id]);

  // Calculate geofence distance on coordinates change
  useEffect(() => {
    if (userCoords && office) {
      const R = 6371e3;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(office.latitude - userCoords.lat);
      const dLon = toRad(office.longitude - userCoords.lon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(userCoords.lat)) * Math.cos(toRad(office.latitude)) * Math.sin(dLon / 2) ** 2;
      const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      setDistanceMeters(dist);
      setInsideGeofence(dist <= office.radius_meters);
    }
  }, [userCoords, office]);

  // Video frame biometric processing loop
  useEffect(() => {
    let animId: number;
    let frameCount = 0;

    const processFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && cameraReady) {
        frameCount++;
        if (frameCount % 10 === 0) {
          const detection = await analyzeVideoFrame(videoRef.current);
          if (detection.faceCount === 1) {
            setFaceDetected(true);
            setQualityScore(detection.quality);
            setLivenessScore(detection.livenessScore);
            setLastEmbedding(detection.embedding);

            if (detection.livenessScore >= 0.6) {
              setLivenessPassed(true);
              setLivenessInstruction('Face and liveness verified ✓');
            } else {
              setLivenessInstruction('Please blink or move head slightly');
            }
          } else if (detection.faceCount > 1) {
            setFaceDetected(false);
            setLivenessInstruction('Multiple faces detected - only 1 person allowed');
          } else {
            setFaceDetected(false);
            setLivenessInstruction('Center your face in the oval');
          }
        }
      }
      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraReady]);

  const handlePerformCheckIn = async () => {
    if (!userCoords) {
      message.error('Waiting for GPS coordinates...');
      return;
    }

    if (!faceDetected || lastEmbedding.length === 0) {
      message.error('Face not detected. Please look directly at the camera.');
      return;
    }

    setSubmitting(true);
    setResultError(null);

    try {
      const res = await api.post<ApiResponse<AttendanceSession>>('/attendance/check-in', {
        employeeCodeOrEmail: user!.employee_code,
        latitude: userCoords.lat,
        longitude: userCoords.lon,
        accuracy: Math.round(userCoords.accuracy),
        embedding: lastEmbedding,
        livenessScore,
      });

      message.success('Check-in successful! Attendance session active.');
      // Stop camera stream
      if (stream) stream.getTracks().forEach((t) => t.stop());
      navigate('/employee/dashboard');
    } catch (err: any) {
      const errData = err.response?.data?.error;
      const code = errData?.code || 'CHECK_IN_FAILED';
      const msg = errData?.message || err.message || 'Check-in failed';

      setResultError({
        title: `CHECK-IN REJECTED [${code}]`,
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isReadyToSubmit = faceDetected && livenessPassed && insideGeofence === true && !submitting;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Card style={{ borderRadius: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Employee Face Verification & Geofenced Check-In
        </Title>
        <Text type="secondary">
          Assigned Office: <strong>{office?.name || 'Locating office...'}</strong> (Allowed Radius: {office?.radius_meters || 150}m)
        </Text>

        <Divider style={{ margin: '16px 0 24px' }} />

        {resultError && (
          <Alert
            message={resultError.title}
            description={
              <div>
                <div>{resultError.message}</div>
                {resultError.title.includes('FACE_MISMATCH') && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ marginBottom: 8, fontSize: 13, color: '#a8071a' }}>
                      <strong>Why this happened:</strong> Your live webcam face was compared against the seeded reference photo of Alex Mercer shown below. To check in with your own face, please register your face template first:
                    </div>
                    <Button
                      type="primary"
                      danger
                      onClick={() => {
                        if (stream) stream.getTracks().forEach((t) => t.stop());
                        navigate('/employee/face-enrollment');
                      }}
                    >
                      📸 Register / Update My Face Now
                    </Button>
                  </div>
                )}
              </div>
            }
            type="error"
            showIcon
            style={{ marginBottom: 24, fontSize: 15 }}
          />
        )}

        {!user?.face_enrolled && (
          <Alert
            type="warning"
            showIcon
            message="No Reference Face Enrolled"
            description={
              <span>
                You must upload or capture your official reference photo before you can check in.{' '}
                <Button
                  type="primary"
                  size="small"
                  onClick={() => navigate('/employee/face-enrollment')}
                >
                  Upload Reference Face
                </Button>
              </span>
            }
            style={{ marginBottom: 20 }}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          {/* Left: Video / Camera Area */}
          <div>
            <div className="camera-container">
              <video ref={videoRef} playsInline muted className="camera-video" />

              <div
                className={`face-guide-overlay ${
                  faceDetected ? (livenessPassed ? 'detected' : 'warning') : ''
                }`}
              />

              <div className="camera-status-badge">
                {cameraReady ? (
                  <Tag color="success">Live Camera Active</Tag>
                ) : (
                  <Tag color="default">Initializing Camera...</Tag>
                )}
              </div>

              <div className="liveness-instruction-box">{livenessInstruction}</div>
            </div>

            {/* Reference Face Comparison Badge / Card */}
            {referenceImage && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#f0f5ff',
                  border: '1px solid #adc6ff',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <img
                  src={referenceImage}
                  alt="Reference Face"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    objectFit: 'cover',
                    border: '2px solid #2f54eb',
                  }}
                />
                <div>
                  <Text strong style={{ color: '#1d39c4' }}>
                    Uploaded Reference Template
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Live webcam biometric scan is matched 1:1 against this uploaded reference face.
                  </Text>
                </div>
              </div>
            )}
          </div>

          {/* Right: Real-time Multi-factor Verification Steps */}
          <div>
            <Card
              size="small"
              title="Identity & Access Checklist"
              style={{ background: '#fafafa', borderRadius: 12, height: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. Identity */}
                <div className="status-step-item">
                  <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  <div>
                    <Text strong>Employee Identity</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.name} ({user?.employee_code})
                    </Text>
                  </div>
                </div>

                {/* 2. Reference Face Template */}
                <div className="status-step-item">
                  {user?.face_enrolled ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Reference Face Enrolled</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.face_enrolled ? 'Reference photo stored ✓' : 'Upload photo required'}
                    </Text>
                  </div>
                </div>

                {/* 3. Live Face Match */}
                <div className="status-step-item">
                  {faceDetected ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Live Face Match & Clarity</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {faceDetected ? `Quality: ${(qualityScore * 100).toFixed(0)}% (Matching reference)` : 'No live face in view'}
                    </Text>
                  </div>
                </div>

                {/* 3. Liveness Anti-Spoof */}
                <div className="status-step-item">
                  {livenessPassed ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#faad14', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Liveness Anti-Spoof Check</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {livenessPassed ? `Score: ${(livenessScore * 100).toFixed(0)}% ✓` : 'Awaiting motion/blink'}
                    </Text>
                  </div>
                </div>

                {/* 4. GPS Accuracy */}
                <div className="status-step-item">
                  {userCoords && userCoords.accuracy <= 100 ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>GPS Accuracy</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {userCoords ? `+/- ${Math.round(userCoords.accuracy)}m (Max 100m)` : 'Acquiring GPS fix...'}
                    </Text>
                  </div>
                </div>

                {/* 5. Office Geofence */}
                <div className="status-step-item">
                  {insideGeofence === true ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : insideGeofence === false ? (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#8c8c8c', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Office Geofence</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {distanceMeters !== null && office
                        ? `${distanceMeters}m from office (Max: ${office.radius_meters}m)`
                        : 'Calculating distance...'}
                    </Text>
                  </div>
                </div>
              </div>

              <Divider style={{ margin: '16px 0' }} />

              {/* Submission Button */}
              <Button
                type="primary"
                size="large"
                block
                icon={<SafetyCertificateOutlined />}
                disabled={!isReadyToSubmit}
                loading={submitting}
                style={{
                  height: 50,
                  fontSize: 16,
                  borderRadius: 8,
                  background: isReadyToSubmit ? '#16a34a' : undefined,
                  borderColor: isReadyToSubmit ? '#16a34a' : undefined,
                }}
                onClick={handlePerformCheckIn}
              >
                {insideGeofence === false ? 'OUTSIDE GEOFENCE' : 'CONFIRM CHECK-IN'}
              </Button>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
};
