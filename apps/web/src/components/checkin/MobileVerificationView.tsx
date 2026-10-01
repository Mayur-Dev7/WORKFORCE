import React, { useState, RefObject } from 'react';
import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  RightOutlined,
  DownOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { User, Office } from '@workforce/shared';
import type { VerificationResult } from '../../context/LocationContext.js';

interface MobileVerificationViewProps {
  mode: 'check-in' | 'check-out';
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  faceDetected: boolean;
  qualityScore: number;
  faceMatched: boolean;
  faceSimilarity: number;
  livenessPassed: boolean;
  livenessScore: number;
  userCoords: { lat: number; lon: number; accuracy: number } | null;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
  locationChecking: boolean;
  locationVerification: VerificationResult | null;
  user: User | null;
  office: Office | null;
  referenceImage: string | null;
  submitting: boolean;
  resultError: { title: string; message: string } | null;
  onAction: () => void;
  onRefreshLocation: () => void;
  onNavigateToEnrollment: () => void;
}

export const MobileVerificationView: React.FC<MobileVerificationViewProps> = ({
  mode,
  videoRef,
  cameraReady,
  faceDetected,
  qualityScore,
  faceMatched,
  faceSimilarity,
  livenessPassed,
  livenessScore,
  userCoords,
  distanceMeters,
  insideGeofence,
  locationChecking,
  locationVerification,
  user,
  office,
  referenceImage,
  submitting,
  resultError,
  onAction,
  onRefreshLocation,
  onNavigateToEnrollment,
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const isCheckOut = mode === 'check-out';

  // 1. Camera Frame Status & Outline
  let cameraFrameClass = 'neutral';
  let cameraStatus = 'Position your face inside the frame';

  if (!cameraReady) {
    cameraStatus = 'Starting camera...';
    cameraFrameClass = 'neutral';
  } else if (!user?.face_enrolled) {
    cameraStatus = 'Face not enrolled';
    cameraFrameClass = 'error';
  } else if (!faceDetected) {
    cameraStatus = 'Position your face inside the frame';
    cameraFrameClass = 'neutral';
  } else if (!faceMatched) {
    cameraStatus = "Face doesn't match";
    cameraFrameClass = 'error';
  } else if (!livenessPassed) {
    cameraStatus = 'Please blink or nod';
    cameraFrameClass = 'detected';
  } else {
    cameraStatus = 'Face verified';
    cameraFrameClass = 'verified';
  }

  // 2. Compact Status Results (Immediately below camera)
  // Face Status
  let faceStatusType: 'success' | 'error' | 'loading' | 'waiting' = 'loading';
  let faceStatusText = 'Verifying identity...';

  if (!user?.face_enrolled) {
    faceStatusType = 'error';
    faceStatusText = 'Face profile not enrolled';
  } else if (!faceDetected) {
    faceStatusType = 'waiting';
    faceStatusText = 'Position face in frame';
  } else if (faceMatched && livenessPassed) {
    faceStatusType = 'success';
    faceStatusText = 'Face verified';
  } else if (!faceMatched) {
    faceStatusType = 'error';
    faceStatusText = "Face doesn't match";
  } else {
    faceStatusType = 'loading';
    faceStatusText = 'Confirming liveness...';
  }

  // Location Status
  let locationStatusType: 'success' | 'error' | 'loading' = 'loading';
  let locationStatusText = 'Checking location...';
  let locationSecondary = '';

  if (insideGeofence === true) {
    locationStatusType = 'success';
    locationStatusText = 'Inside office boundary';
    locationSecondary = distanceMeters !== null ? `${distanceMeters} m from office` : '';
  } else if (insideGeofence === false) {
    locationStatusType = 'error';
    locationStatusText = 'Outside office boundary';
    locationSecondary = `${distanceMeters ?? '--'} m away · ${office?.radius_meters || 150} m allowed`;
  } else if (locationChecking) {
    locationStatusType = 'loading';
    locationStatusText = 'Checking location...';
  } else if (!userCoords) {
    locationStatusType = 'error';
    locationStatusText = 'Location unavailable';
  }

  // 3. Primary Action Evaluation
  const isReady =
    faceDetected &&
    faceMatched &&
    livenessPassed &&
    insideGeofence === true &&
    !submitting;

  let actionTitle = isCheckOut ? 'Ready to check out' : 'Ready to check in';
  let actionDesc = 'Face verified · Inside office boundary';
  let actionStateType: 'ready' | 'processing' | 'mismatch' | 'outside' | 'error' = 'ready';

  if (!user?.face_enrolled) {
    actionTitle = 'Face profile required';
    actionDesc = 'Please enroll your face reference';
    actionStateType = 'error';
  } else if (!faceDetected || !cameraReady) {
    actionTitle = 'Position face in frame';
    actionDesc = 'Keep your face centered';
    actionStateType = 'processing';
  } else if (!faceMatched) {
    actionTitle = "Face doesn't match";
    actionDesc = 'Move into frame and try again';
    actionStateType = 'mismatch';
  } else if (!livenessPassed) {
    actionTitle = 'Confirming liveness';
    actionDesc = 'Blink or nod your head';
    actionStateType = 'processing';
  } else if (locationChecking) {
    actionTitle = 'Checking location...';
    actionDesc = 'Acquiring GPS fix';
    actionStateType = 'processing';
  } else if (insideGeofence === false) {
    actionTitle = 'Outside office boundary';
    actionDesc = `${distanceMeters ?? '--'} m away · ${office?.radius_meters || 150} m allowed`;
    actionStateType = 'outside';
  } else if (!userCoords) {
    actionTitle = 'Location unavailable';
    actionDesc = 'Allow location permissions to proceed';
    actionStateType = 'error';
  }

  return (
    <div className="apple-mobile-checkin-container">
      {/* ─── Compact Inline Alert for System Errors ─── */}
      {resultError && (
        <div className="apple-mobile-inline-error" role="alert">
          <div className="apple-mobile-error-text">
            <strong>{resultError.title}</strong>
            <p>{resultError.message}</p>
          </div>
          <button
            type="button"
            className="apple-mobile-error-btn"
            onClick={resultError.title.includes('FACE_MISMATCH') ? onNavigateToEnrollment : onRefreshLocation}
          >
            {resultError.title.includes('FACE_MISMATCH') ? 'Update Face' : 'Try Again'}
          </button>
        </div>
      )}

      {/* ─── 1. Live Camera Surface (~50-55% of usable viewport) ─── */}
      <div className="apple-mobile-camera-surface" aria-label="Camera feed for verification">
        <video
          ref={videoRef as any}
          playsInline
          muted
          className="apple-mobile-camera-video"
        />

        {/* Subtle Live Status Indicator */}
        <div className="apple-camera-live-pill" aria-live="off">
          <span
            className={`apple-live-dot ${cameraReady ? '' : 'initializing'}`}
            aria-hidden="true"
          />
          <span>{cameraReady ? 'Live' : 'Initializing...'}</span>
        </div>

        {/* Dynamic Subtle Guidance Frame */}
        <div
          className={`apple-mobile-face-guide ${cameraFrameClass}`}
          aria-hidden="true"
        />

        {/* Single Concise Live Message (No percentages) */}
        <div className="apple-mobile-camera-pill" role="status" aria-live="polite">
          {cameraStatus}
        </div>
      </div>

      {/* ─── 2. Compact Status Feedback (Directly Below Camera) ─── */}
      <div className="apple-mobile-status-card">
        {/* Face Status Line */}
        <div className="apple-mobile-status-row">
          <div className={`apple-mobile-icon-circle ${faceStatusType}`}>
            {faceStatusType === 'success' && <CheckOutlined />}
            {faceStatusType === 'error' && <CloseOutlined />}
            {faceStatusType === 'loading' && <LoadingOutlined />}
            {faceStatusType === 'waiting' && <span className="apple-mobile-dot" />}
          </div>
          <div className="apple-mobile-status-text">
            <span className={`apple-mobile-status-label ${faceStatusType === 'error' ? 'error' : ''}`}>
              {faceStatusText}
            </span>
          </div>
        </div>

        {/* Location Status Line */}
        <div className="apple-mobile-status-row">
          <div className={`apple-mobile-icon-circle ${locationStatusType}`}>
            {locationStatusType === 'success' && <CheckOutlined />}
            {locationStatusType === 'error' && <CloseOutlined />}
            {locationStatusType === 'loading' && <LoadingOutlined />}
          </div>
          <div className="apple-mobile-status-text">
            <span className={`apple-mobile-status-label ${locationStatusType === 'error' ? 'error' : ''}`}>
              {locationStatusText}
            </span>
            {locationSecondary && (
              <span className="apple-mobile-status-sub">
                {locationSecondary}
              </span>
            )}
          </div>
          <button
            type="button"
            className="apple-mobile-refresh-btn"
            onClick={onRefreshLocation}
            title="Refresh GPS"
            aria-label="Refresh location"
          >
            <ReloadOutlined spin={locationChecking} />
          </button>
        </div>
      </div>

      {/* ─── 3. Collapsible Secondary Details (Behind 'Verification details ›') ─── */}
      <div className="apple-mobile-details-section">
        <button
          type="button"
          className="apple-mobile-details-trigger"
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          aria-expanded={detailsExpanded}
        >
          <span>Verification details</span>
          {detailsExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        </button>

        {detailsExpanded && (
          <div className="apple-mobile-details-body">
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Employee identity</span>
              <span className="detail-val success">
                <CheckOutlined /> {user?.name} · {user?.employee_code}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Face detected</span>
              <span className={`detail-val ${faceDetected ? 'success' : 'muted'}`}>
                {faceDetected ? '✓ Verified' : 'Waiting'}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Face match</span>
              <span className={`detail-val ${faceMatched ? 'success' : faceDetected ? 'error' : 'muted'}`}>
                {faceMatched ? `✓ ${faceSimilarity}%` : faceDetected ? `× ${faceSimilarity}%` : 'Waiting'}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Liveness</span>
              <span className={`detail-val ${livenessPassed ? 'success' : faceDetected ? 'muted' : 'muted'}`}>
                {livenessPassed ? `✓ ${(livenessScore * 100).toFixed(0)}%` : 'Waiting'}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Location</span>
              <span className={`detail-val ${userCoords ? 'success' : 'error'}`}>
                {userCoords ? `✓ GPS active (±${Math.round(userCoords.accuracy)}m)` : 'Unavailable'}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Office boundary</span>
              <span className={`detail-val ${insideGeofence ? 'success' : 'error'}`}>
                {insideGeofence ? '✓ Inside' : '× Outside'}
              </span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Distance</span>
              <span className="detail-val neutral">{distanceMeters !== null ? `${distanceMeters} m` : '--'}</span>
            </div>
            <div className="apple-mobile-detail-row">
              <span className="detail-key">Allowed radius</span>
              <span className="detail-val neutral">{office?.radius_meters || 150} m</span>
            </div>

            {/* Reference Face in details rather than main screen */}
            <div className="apple-mobile-ref-row">
              {referenceImage ? (
                <img src={referenceImage} alt="Enrolled Reference" className="apple-mobile-ref-thumb" />
              ) : (
                <div className="apple-mobile-ref-thumb empty">Photo</div>
              )}
              <div className="apple-mobile-ref-info">
                <span className="ref-title">Enrolled Reference Face</span>
                <span className="ref-desc">Used for 1:1 facial biometric matching</span>
              </div>
              <button
                type="button"
                className="apple-mobile-ref-update-btn"
                onClick={onNavigateToEnrollment}
              >
                Update
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. Docked Primary Action Area (Above Bottom Navigation) ─── */}
      <div className="apple-mobile-action-bar">
        <div className="apple-mobile-action-status">
          <span className={`action-status-title ${isReady ? 'ready' : ''}`}>
            {actionTitle}
          </span>
          <span className="action-status-desc">{actionDesc}</span>
        </div>

        {actionStateType === 'mismatch' ? (
          <button
            type="button"
            className="apple-mobile-primary-btn retry"
            onClick={onAction}
          >
            <ReloadOutlined />
            <span>Try Again</span>
          </button>
        ) : (
          <button
            type="button"
            className="apple-mobile-primary-btn"
            disabled={!isReady}
            onClick={onAction}
          >
            <SafetyCertificateOutlined />
            <span>
              {submitting
                ? (isCheckOut ? 'Checking out...' : 'Checking in...')
                : (isCheckOut ? 'Check Out' : 'Check In')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
