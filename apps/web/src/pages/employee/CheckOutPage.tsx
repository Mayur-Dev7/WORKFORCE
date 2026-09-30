import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext.js';
import { useLocationWarmup, VerificationResult } from '../../context/LocationContext.js';
import { api } from '../../services/api.js';
import { analyzeVideoFrame, evaluateFaceMatch } from '../../services/face.client.js';
import { Office, ApiResponse, AttendanceSession } from '@workforce/shared';

const { Title, Text } = Typography;

export const CheckOutPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { cachedOffice, cachedFaceTemplate, getFastVerifiedLocation, forceRefreshOffice } = useLocationWarmup();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // States
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [qualityScore, setQualityScore] = useState(0);
  const [faceMatched, setFaceMatched] = useState(false);
  const [faceSimilarity, setFaceSimilarity] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [lastEmbedding, setLastEmbedding] = useState<number[]>([]);

  // Geolocation & Fast Verification states
  const [referenceEmbedding, setReferenceEmbedding] = useState<number[] | null>(cachedFaceTemplate?.embedding || null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [office, setOffice] = useState<Office | null>(cachedOffice || null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null);
  const [locationChecking, setLocationChecking] = useState(true);
  const [locationVerification, setLocationVerification] = useState<VerificationResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [resultError, setResultError] = useState<{ title: string; message: string } | null>(null);
  const [livenessInstruction, setLivenessInstruction] = useState('Position face inside oval');

  // Sync office state with cachedOffice whenever it updates
  useEffect(() => {
    if (cachedOffice) {
      setOffice(cachedOffice);
    }
  }, [cachedOffice]);

  // Verify location using warmed background snapshot & fast fresh GPS check
  const verifyLocation = useCallback(async (forceFresh = false) => {
    setLocationChecking(true);
    try {
      const result = await getFastVerifiedLocation(forceFresh);
      setLocationVerification(result);
      setUserCoords(result.coords);
      setDistanceMeters(result.distanceMeters);
      setInsideGeofence(result.insideGeofence);
      if (result.office) setOffice(result.office);
    } catch (err: any) {
      setResultError({
        title: 'Location Verification Failed',
        message: err.message || 'Could not verify GPS coordinates against office geofence.',
      });
      setInsideGeofence(false);
    } finally {
      setLocationChecking(false);
    }
  }, [getFastVerifiedLocation]);

  useEffect(() => {
    let active = true;

    async function init() {
      // 1. Refresh user to ensure latest office_id
      const freshUser = await refreshUser();
      const currentOfficeId = freshUser?.office_id || user?.office_id;

      // 2. Preload/revalidate office
      if (currentOfficeId) {
        if (!cachedOffice || cachedOffice.id !== currentOfficeId) {
          try {
            const off = await forceRefreshOffice(currentOfficeId);
            if (active && off) setOffice(off);
          } catch (e) {
            console.error('Failed to load fresh office', e);
          }
        }
      }

      // 2. Preload face template if not yet in cache
      if (!cachedFaceTemplate) {
        api.get('/users/self/face-template')
          .then((faceRes) => {
            if (active && faceRes.data?.data) {
              if (faceRes.data.data.embedding && Array.isArray(faceRes.data.data.embedding)) {
                setReferenceEmbedding(faceRes.data.data.embedding);
              }
            }
          })
          .catch((e) => console.warn('Could not fetch reference template', e));
      }

      // 3. Fast location verification in parallel
      verifyLocation(false);

      // 4. Start webcam
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
    }

    init();

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [user?.office_id, cachedOffice, cachedFaceTemplate, verifyLocation]);

  useEffect(() => {
    let animId: number;
    let frameCount = 0;

    const processFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && cameraReady) {
        frameCount++;
        if (frameCount % 6 === 0) {
          const detection = await analyzeVideoFrame(videoRef.current);
          if (detection.faceCount === 1) {
            setFaceDetected(true);
            setQualityScore(detection.quality);
            setLivenessScore(detection.livenessScore);
            setLastEmbedding(detection.embedding);

            // Real-time 1:1 Biometric Comparison against enrolled reference
            const evalResult = (referenceEmbedding && referenceEmbedding.length > 0 && detection.embedding.length > 0)
              ? evaluateFaceMatch(detection.embedding, referenceEmbedding)
              : { matched: false, rawCosine: 0, displayPercentage: 0 };

            setFaceSimilarity(evalResult.displayPercentage);
            setFaceMatched(evalResult.matched);

            const livenessOk = detection.livenessScore >= 0.5;
            setLivenessPassed(livenessOk);

            if (!referenceEmbedding) {
              setLivenessInstruction('No reference face template enrolled');
            } else if (!evalResult.matched) {
              setLivenessInstruction(`Face mismatch (${evalResult.displayPercentage}% match) — does not match ${user?.name}`);
            } else if (!livenessOk) {
              setLivenessInstruction(`Identity verified (${evalResult.displayPercentage}%) — please blink or nod`);
            } else {
              setLivenessInstruction(`Identity & Liveness Verified (${evalResult.displayPercentage}% match) ✓`);
            }
          } else if (detection.faceCount > 1) {
            setFaceDetected(false);
            setFaceMatched(false);
            setLivenessInstruction('Multiple faces detected - only 1 person allowed');
          } else {
            setFaceDetected(false);
            setFaceMatched(false);
            setLivenessInstruction('Position face in oval guide');
          }
        }
      }
      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraReady, referenceEmbedding, user?.name]);

  const handlePerformCheckOut = async () => {
    if (!userCoords) {
      message.error('Waiting for GPS coordinates...');
      return;
    }

    if (!faceDetected || lastEmbedding.length === 0) {
      message.error('Face not detected. Please look directly at camera.');
      return;
    }

    if (!faceMatched) {
      message.error(`Face does not match registered employee (${Math.max(0, Math.round(faceSimilarity * 100))}% match - requires ≥ 65%)`);
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

  const isReadyToSubmit =
    faceDetected &&
    faceMatched &&
    livenessPassed &&
    insideGeofence === true &&
    !submitting;

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

        <div className="checkin-grid">
          <div>
            <div className="camera-container">
              <video ref={videoRef} playsInline muted className="camera-video" />
              <div
                className={`face-guide-overlay ${
                  faceDetected ? (faceMatched && livenessPassed ? 'detected' : 'warning') : ''
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
                    <Text strong>Live Camera Face Detection</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {faceDetected
                        ? `Face in view (Clarity: ${(qualityScore * 100).toFixed(0)}%)`
                        : 'No face in camera view'}
                    </Text>
                  </div>
                </div>

                <div className="status-step-item">
                  {faceMatched ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
                  )}
                  <div>
                    <Text strong>Biometric Identity Match (1:1)</Text>
                    <br />
                    <Text
                      style={{
                        fontSize: 12,
                        color: faceMatched ? '#52c41a' : '#cf1322',
                        fontWeight: '500',
                      }}
                    >
                      {!user?.face_enrolled
                        ? 'Reference photo required'
                        : !faceDetected
                        ? 'Position face to verify'
                        : faceMatched
                        ? `Identity Verified: ${faceSimilarity}% match with ${user?.name} ✓`
                        : `Face Mismatch: ${faceSimilarity}% match (Does not match ${user?.name})`}
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
                      {livenessPassed ? `Score: ${(livenessScore * 100).toFixed(0)}% ✓` : 'Awaiting motion/blink'}
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
                      {userCoords
                        ? `+/- ${Math.round(userCoords.accuracy)}m (Max 100m)`
                        : locationChecking
                        ? 'Acquiring GPS fix...'
                        : 'GPS unavailable'}
                    </Text>
                  </div>
                </div>

                <div className="status-step-item" style={{ alignItems: 'flex-start' }}>
                  {insideGeofence === true ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18, marginTop: 2 }} />
                  ) : (
                    <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18, marginTop: 2 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                      <Text strong>Office Geofence</Text>
                      {locationVerification?.matchType === 'instant_match' && (
                        <Tag color="success" style={{ margin: 0, fontSize: 11, borderRadius: 10 }}>
                          ⚡ Instant Match ({locationVerification.latencyMs}ms)
                        </Tag>
                      )}
                      {locationVerification?.matchType === 'fresh_geofence_match' && (
                        <Tag color="processing" style={{ margin: 0, fontSize: 11, borderRadius: 10 }}>
                          📍 Live GPS ({locationVerification.latencyMs}ms)
                        </Tag>
                      )}
                      {locationVerification?.matchType === 'outside_geofence' && (
                        <Tag color="error" style={{ margin: 0, fontSize: 11, borderRadius: 10 }}>
                          Outside Geofence
                        </Tag>
                      )}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {locationChecking
                        ? 'Verifying office location...'
                        : distanceMeters !== null && office
                        ? locationVerification?.matchType === 'instant_match'
                          ? `Inside office (${distanceMeters}m from center, matched with app launch)`
                          : insideGeofence
                          ? `Inside office (${distanceMeters}m from center, Max ${office.radius_meters}m)`
                          : `${distanceMeters}m from office (Allowed: ${office.radius_meters}m)`
                        : 'Awaiting location check'}
                    </Text>
                  </div>
                  <Button
                    size="small"
                    type="text"
                    icon={<ReloadOutlined spin={locationChecking} />}
                    onClick={() => verifyLocation(true)}
                    title="Force refresh GPS"
                    style={{ color: '#ff4d4f', padding: '0 4px' }}
                  />
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
                style={{ height: 50, fontSize: 15, borderRadius: 8 }}
                onClick={handlePerformCheckOut}
              >
                {insideGeofence === false
                  ? 'OUTSIDE GEOFENCE'
                  : !user?.face_enrolled
                  ? 'ENROLL FACE FIRST'
                  : !faceDetected
                  ? 'POSITION FACE IN OVAL'
                  : !faceMatched
                  ? 'FACE MISMATCH — CANNOT CHECK OUT'
                  : !livenessPassed
                  ? 'AWAITING LIVENESS CHECK'
                  : 'CONFIRM CHECK-OUT'}
              </Button>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
};
