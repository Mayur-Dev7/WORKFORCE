import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Alert,
  Typography,
  Tag,
  Divider,
  message,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { analyzeVideoFrame } from '../../services/face.client.js';
import { Office, ApiResponse, AttendanceSession } from '@workforce/shared';

const { Title, Text } = Typography;

export const CheckOutPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // States
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [qualityScore, setQualityScore] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [lastEmbedding, setLastEmbedding] = useState<number[]>([]);

  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [resultError, setResultError] = useState<{ title: string; message: string } | null>(null);
  const [livenessInstruction, setLivenessInstruction] = useState('Position face inside oval');

  useEffect(() => {
    let active = true;

    async function init() {
      if (user?.office_id) {
        try {
          const res = await api.get<ApiResponse<Office>>(`/offices/${user.office_id}`);
          if (active) setOffice(res.data.data);
        } catch (e) {
          console.error(e);
        }
      }

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
            message: 'Camera permission is required for face biometric check-out.',
          });
        }
      }

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
              message: `Could not retrieve GPS coordinates: ${err.message}`,
            });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }

    init();

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [user?.office_id]);

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
              setLivenessInstruction('Face ready for check-out ✓');
            } else {
              setLivenessInstruction('Blink or turn slightly');
            }
          } else {
            setFaceDetected(false);
            setLivenessInstruction('Look directly at camera');
          }
        }
      }
      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraReady]);

  const handlePerformCheckOut = async () => {
    if (!userCoords) {
      message.error('Waiting for GPS coordinates...');
      return;
    }

    if (!faceDetected || lastEmbedding.length === 0) {
      message.error('Face not detected. Please look directly at camera.');
      return;
    }

    setSubmitting(true);
    setResultError(null);

    try {
      await api.post<ApiResponse<AttendanceSession>>('/attendance/check-out', {
        employeeCodeOrEmail: user!.employee_code,
        latitude: userCoords.lat,
        longitude: userCoords.lon,
        accuracy: Math.round(userCoords.accuracy),
        embedding: lastEmbedding,
        livenessScore,
      });

      message.success('Check-out completed! Attendance session closed.');
      if (stream) stream.getTracks().forEach((t) => t.stop());
      navigate('/employee/dashboard');
    } catch (err: any) {
      const errData = err.response?.data?.error;
      const code = errData?.code || 'CHECK_OUT_FAILED';
      const msg = errData?.message || err.message || 'Check-out failed';

      setResultError({
        title: `CHECK-OUT REJECTED [${code}]`,
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
          Employee Face Verification & Geofenced Check-Out
        </Title>
        <Text type="secondary">
          Assigned Office: <strong>{office?.name || 'Locating office...'}</strong>
        </Text>

        <Divider style={{ margin: '16px 0 24px' }} />

        {resultError && (
          <Alert
            message={resultError.title}
            description={resultError.message}
            type="error"
            showIcon
            style={{ marginBottom: 24, fontSize: 15 }}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          <div>
            <div className="camera-container">
              <video ref={videoRef} playsInline muted className="camera-video" />
              <div
                className={`face-guide-overlay ${
                  faceDetected ? (livenessPassed ? 'detected' : 'warning') : ''
                }`}
              />
              <div className="camera-status-badge">
                <Tag color={cameraReady ? 'success' : 'default'}>
                  {cameraReady ? 'Camera Active' : 'Initializing...'}
                </Tag>
              </div>
              <div className="liveness-instruction-box">{livenessInstruction}</div>
            </div>
          </div>

          <div>
            <Card
              size="small"
              title="Identity & Access Checklist"
              style={{ background: '#fafafa', borderRadius: 12, height: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

                <div className="status-step-item">
                  {faceDetected ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Face Verification</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {faceDetected ? `Quality: ${(qualityScore * 100).toFixed(0)}%` : 'No face in oval guide'}
                    </Text>
                  </div>
                </div>

                <div className="status-step-item">
                  {livenessPassed ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#faad14', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Liveness Anti-Spoof</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {livenessPassed ? `Score: ${(livenessScore * 100).toFixed(0)}%` : 'Awaiting motion'}
                    </Text>
                  </div>
                </div>

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
                      {userCoords ? `+/- ${Math.round(userCoords.accuracy)}m` : 'Locating...'}
                    </Text>
                  </div>
                </div>

                <div className="status-step-item">
                  {insideGeofence === true ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Office Geofence</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {distanceMeters !== null && office
                        ? `${distanceMeters}m / max ${office.radius_meters}m`
                        : 'Calculating...'}
                    </Text>
                  </div>
                </div>
              </div>

              <Divider style={{ margin: '16px 0' }} />

              <Button
                type="primary"
                danger
                size="large"
                block
                icon={<SafetyCertificateOutlined />}
                disabled={!isReadyToSubmit}
                loading={submitting}
                style={{ height: 50, fontSize: 16, borderRadius: 8 }}
                onClick={handlePerformCheckOut}
              >
                CONFIRM CHECK-OUT
              </Button>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
};
