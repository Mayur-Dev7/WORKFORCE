import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { useAuth } from '../../context/AuthContext.js';
import { useLocationWarmup, VerificationResult } from '../../context/LocationContext.js';
import { api } from '../../services/api.js';
import { analyzeVideoFrame, evaluateFaceMatch } from '../../services/face.client.js';
import { Office, ApiResponse, AttendanceSession } from '@workforce/shared';

import { CompactAlert } from '../../components/checkin/CompactAlert.js';
import { CameraFeed } from '../../components/checkin/CameraFeed.js';
import { FaceMatchFeedback } from '../../components/checkin/FaceMatchFeedback.js';
import { ReferenceFaceCard } from '../../components/checkin/ReferenceFaceCard.js';
import { VerificationPanel } from '../../components/checkin/VerificationPanel.js';
import { MobileVerificationView } from '../../components/checkin/MobileVerificationView.js';

export const CheckInPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { cachedOffice, cachedFaceTemplate, getFastVerifiedLocation, forceRefreshOffice } = useLocationWarmup();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Verification pipeline states
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [qualityScore, setQualityScore] = useState(0);
  const [faceMatched, setFaceMatched] = useState(false);
  const [faceSimilarity, setFaceSimilarity] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [lastEmbedding, setLastEmbedding] = useState<number[]>([]);

  // Geolocation & Fast Verification states
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [office, setOffice] = useState<Office | null>(cachedOffice || null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [insideGeofence, setInsideGeofence] = useState<boolean | null>(null);
  const [locationChecking, setLocationChecking] = useState(true);
  const [locationVerification, setLocationVerification] = useState<VerificationResult | null>(null);

  // Reference face template (pre-loaded from cache when available)
  const [referenceImage, setReferenceImage] = useState<string | null>(cachedFaceTemplate?.referenceImage || null);
  const [referenceEmbedding, setReferenceEmbedding] = useState<number[] | null>(cachedFaceTemplate?.embedding || null);

  // Request & Submission state
  const [submitting, setSubmitting] = useState(false);
  const [resultError, setResultError] = useState<{ title: string; message: string } | null>(null);
  const [livenessInstruction, setLivenessInstruction] = useState('Position face inside frame');

  // Responsive layout state
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        title: 'Location Unavailable',
        message: err.message || 'Could not verify GPS coordinates against office geofence.',
      });
      setInsideGeofence(false);
    } finally {
      setLocationChecking(false);
    }
  }, [getFastVerifiedLocation]);

  // Load office details, reference face & start camera and location check in parallel
  useEffect(() => {
    let active = true;

    async function init() {
      // 1. Refresh current user to make sure office_id is not stale from localStorage
      const freshUser = await refreshUser();
      const currentOfficeId = freshUser?.office_id || user?.office_id;

      // 2. Fetch fresh office if missing or changed
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

      // 3. Fetch reference face template if not already in cache
      if (!cachedFaceTemplate) {
        api.get('/users/self/face-template')
          .then((faceRes) => {
            if (active && faceRes.data?.data) {
              if (faceRes.data.data.referenceImage) {
                setReferenceImage(faceRes.data.data.referenceImage);
              }
              if (faceRes.data.data.embedding && Array.isArray(faceRes.data.data.embedding)) {
                setReferenceEmbedding(faceRes.data.data.embedding);
              }
            }
          })
          .catch((e) => console.warn('Could not fetch reference face', e));
      }

      // 4. Fast location verification in parallel
      verifyLocation(false);

      // 5. Start webcam in parallel
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
            message: 'Camera permission is required for face biometric check-in. Please allow browser camera access.',
          });
        }
      }
    }

    init();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [user?.office_id, cachedOffice, cachedFaceTemplate, verifyLocation]);

  // Ensure active video element receives the stream and plays whenever stream or layout changes
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(console.error);
      setCameraReady(true);
    }
  }, [stream, isMobile]);

  // Video frame biometric processing loop
  useEffect(() => {
    let animId: number;
    let frameCount = 0;

    const processFrame = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2 && cameraReady) {
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
              setLivenessInstruction(`Face mismatch (${evalResult.displayPercentage}% match)`);
            } else if (!livenessOk) {
              setLivenessInstruction('Please blink or nod to confirm liveness');
            } else {
              setLivenessInstruction('Identity & Liveness Verified ✓');
            }
          } else if (detection.faceCount > 1) {
            setFaceDetected(false);
            setFaceMatched(false);
            setLivenessInstruction('Multiple faces detected - only 1 person allowed');
          } else {
            setFaceDetected(false);
            setFaceMatched(false);
            setLivenessInstruction('Position your face inside the frame');
          }
        }
      }
      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraReady, referenceEmbedding, user?.name]);

  const handlePerformCheckIn = async () => {
    if (!userCoords) {
      message.error('Waiting for GPS coordinates...');
      return;
    }

    if (!faceDetected || lastEmbedding.length === 0) {
      message.error('Face not detected. Please look directly at the camera.');
      return;
    }

    if (!faceMatched) {
      message.error(`Face does not match registered employee (${faceSimilarity}% match - requires ≥ 60%)`);
      return;
    }

    setSubmitting(true);
    setResultError(null);

    try {
      await api.post<ApiResponse<AttendanceSession>>('/attendance/check-in', {
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
        title: `Check-In Rejected [${code}]`,
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigateToEnrollment = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    navigate('/employee/face-enrollment');
  };

  return (
    <div className="apple-checkin-wrapper">
      {isMobile ? (
        /* ─── Mobile View: Focused, no-scroll, Apple HIG ─── */
        <div className="apple-checkin-mobile-layout">
          <MobileVerificationView
            mode="check-in"
            videoRef={videoRef}
            cameraReady={cameraReady}
            faceDetected={faceDetected}
            qualityScore={qualityScore}
            faceMatched={faceMatched}
            faceSimilarity={faceSimilarity}
            livenessPassed={livenessPassed}
            livenessScore={livenessScore}
            userCoords={userCoords}
            distanceMeters={distanceMeters}
            insideGeofence={insideGeofence}
            locationChecking={locationChecking}
            locationVerification={locationVerification}
            user={user}
            office={office}
            referenceImage={referenceImage}
            submitting={submitting}
            resultError={resultError}
            onAction={handlePerformCheckIn}
            onRefreshLocation={() => verifyLocation(true)}
            onNavigateToEnrollment={handleNavigateToEnrollment}
          />
        </div>
      ) : (
        /* ─── Desktop View: Two-Column Spacious Enterprise Layout ─── */
        <div className="apple-checkin-desktop-layout">
          <header className="apple-checkin-header">
            <h1 className="apple-checkin-title">Employee Check-In</h1>
            <p className="apple-checkin-subtitle">
              Face verification and office location are checked before attendance is recorded.
            </p>
            <div className="apple-checkin-office-chip">
              <span>Assigned Office:</span>
              <strong>{office?.name || 'Locating office...'}</strong>
              <span>· Allowed radius {office?.radius_meters || 150} m</span>
            </div>
          </header>

          {resultError && (
            <CompactAlert
              type="error"
              title={resultError.title}
              message={resultError.message}
              actionText={resultError.title.includes('FACE_MISMATCH') ? 'Update Face' : 'Try Again'}
              onAction={() => {
                if (resultError.title.includes('FACE_MISMATCH')) {
                  handleNavigateToEnrollment();
                } else {
                  setResultError(null);
                  verifyLocation(true);
                }
              }}
            />
          )}

          <div className="apple-checkin-grid">
            {/* Left Column (~60%): Camera + Face Match Feedback + Reference Face */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <CameraFeed
                videoRef={videoRef}
                cameraReady={cameraReady}
                faceDetected={faceDetected}
                faceMatched={faceMatched}
                livenessPassed={livenessPassed}
                livenessInstruction={livenessInstruction}
              />

              <FaceMatchFeedback
                faceDetected={faceDetected}
                faceMatched={faceMatched}
                faceSimilarity={faceSimilarity}
                expectedName={user?.name}
                expectedCode={user?.employee_code || undefined}
                faceEnrolled={user?.face_enrolled}
              />

              <ReferenceFaceCard
                referenceImage={referenceImage}
                faceEnrolled={Boolean(user?.face_enrolled)}
                onUpdate={handleNavigateToEnrollment}
              />
            </div>

            {/* Right Column (~40%): Verification Sequence & Primary Action */}
            <VerificationPanel
              user={user}
              office={office}
              faceDetected={faceDetected}
              qualityScore={qualityScore}
              faceMatched={faceMatched}
              faceSimilarity={faceSimilarity}
              livenessPassed={livenessPassed}
              livenessScore={livenessScore}
              userCoords={userCoords}
              distanceMeters={distanceMeters}
              insideGeofence={insideGeofence}
              locationChecking={locationChecking}
              locationVerification={locationVerification}
              submitting={submitting}
              onCheckIn={handlePerformCheckIn}
              onRefreshLocation={() => verifyLocation(true)}
              onNavigateToEnrollment={handleNavigateToEnrollment}
            />
          </div>
        </div>
      )}
    </div>
  );
};
