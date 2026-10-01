import React, { useState } from 'react';
import { Button } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { VerificationStepItem, StepState } from './VerificationStepItem.js';
import type { VerificationResult } from '../../context/LocationContext.js';
import type { User, Office } from '@workforce/shared';

interface VerificationPanelProps {
  mode?: 'check-in' | 'check-out';
  user: User | null;
  office: Office | null;
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
  submitting: boolean;
  onCheckIn?: () => void;
  onCheckOut?: () => void;
  onAction?: () => void;
  onRefreshLocation: () => void;
  onNavigateToEnrollment: () => void;
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({
  mode = 'check-in',
  user,
  office,
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
  submitting,
  onCheckIn,
  onCheckOut,
  onAction,
  onRefreshLocation,
  onNavigateToEnrollment,
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const isCheckOut = mode === 'check-out';
  const handlePrimaryAction = onAction || (isCheckOut ? onCheckOut : onCheckIn) || onCheckIn;

  // 1. Identity Step
  const identityState: StepState = user ? 'verified' : 'checking';

  // 2. Face Detected Step
  const detectionState: StepState = faceDetected ? 'verified' : 'checking';

  // 3. Face Match Step
  let matchState: StepState = 'waiting';
  let matchDesc = 'Waiting for face';
  if (!user?.face_enrolled) {
    matchState = 'failed';
    matchDesc = 'Reference photo required';
  } else if (!faceDetected) {
    matchState = 'waiting';
    matchDesc = 'Position face to verify';
  } else if (faceMatched) {
    matchState = 'verified';
    matchDesc = `Verified · ${faceSimilarity}% match`;
  } else {
    matchState = 'failed';
    matchDesc = `Does not match · ${faceSimilarity}% match`;
  }

  // 4. Liveness Step
  let livenessState: StepState = 'waiting';
  let livenessDesc = 'Waiting';
  if (livenessPassed) {
    livenessState = 'verified';
    livenessDesc = `Verified · ${(livenessScore * 100).toFixed(0)}%`;
  } else if (faceDetected && faceMatched) {
    livenessState = 'checking';
    livenessDesc = 'Please blink or nod';
  } else {
    livenessState = 'waiting';
    livenessDesc = 'Not evaluated';
  }

  // 5. Location Step
  let locationState: StepState = 'checking';
  let locationDesc = 'Acquiring GPS...';
  if (userCoords && userCoords.accuracy <= 150) {
    locationState = 'verified';
    locationDesc = `GPS active · ±${Math.round(userCoords.accuracy)}m`;
  } else if (locationChecking) {
    locationState = 'checking';
    locationDesc = 'Acquiring GPS...';
  } else if (!userCoords) {
    locationState = 'failed';
    locationDesc = 'Location unavailable';
  } else {
    locationState = 'failed';
    locationDesc = `Accuracy low (±${Math.round(userCoords.accuracy)}m)`;
  }

  // 6. Geofence Boundary Step
  let geofenceState: StepState = 'waiting';
  let geofenceDesc = 'Waiting for location';
  if (insideGeofence === true) {
    geofenceState = 'verified';
    geofenceDesc = `Inside boundary · ${distanceMeters} m from office`;
  } else if (insideGeofence === false) {
    geofenceState = 'failed';
    geofenceDesc = `Outside boundary · ${distanceMeters ?? '--'} m away (${office?.radius_meters || 150} m allowed)`;
  } else if (locationChecking) {
    geofenceState = 'checking';
    geofenceDesc = 'Determining distance...';
  } else {
    geofenceState = 'waiting';
    geofenceDesc = 'Waiting for location';
  }

  // Ready state check
  const isReady =
    faceDetected &&
    faceMatched &&
    livenessPassed &&
    insideGeofence === true &&
    !submitting;

  // Primary action reason when unavailable
  let unavailableReason = 'Verification in progress';
  let showRetryLocation = false;
  let showUpdateFace = false;

  if (!user?.face_enrolled) {
    unavailableReason = 'Face profile not enrolled.';
    showUpdateFace = true;
  } else if (!faceDetected) {
    unavailableReason = 'Position your face inside the camera frame.';
  } else if (!faceMatched) {
    unavailableReason = `Face does not match the enrolled reference (${faceSimilarity}% match).`;
    showUpdateFace = true;
  } else if (!livenessPassed) {
    unavailableReason = 'Please blink or nod to confirm liveness.';
  } else if (locationChecking) {
    unavailableReason = 'Determining office location...';
  } else if (!userCoords) {
    unavailableReason = 'Unable to acquire GPS coordinates.';
    showRetryLocation = true;
  } else if (insideGeofence === false) {
    unavailableReason = `Move within ${office?.radius_meters || 150} m of the office (${distanceMeters ?? '--'} m away).`;
    showRetryLocation = true;
  }

  return (
    <div className="apple-verification-panel" aria-label={`Verification sequence and ${isCheckOut ? 'check-out' : 'check-in'} controls`}>
      <div className="apple-verification-panel-header">
        <h2 className="apple-verification-panel-title">Verification</h2>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={locationChecking} />}
          onClick={onRefreshLocation}
          title="Refresh location and verification state"
          style={{ color: '#0071e3', fontSize: 12, padding: '2px 8px', borderRadius: 6 }}
        >
          Refresh
        </Button>
      </div>

      {/* Step Timeline Sequence */}
      <div className="apple-step-timeline" role="list">
        <VerificationStepItem
          state={identityState}
          title="Employee identity"
          description={`${user?.name || 'Employee'} · ${user?.employee_code || '--'}`}
        />

        <VerificationStepItem
          state={detectionState}
          title="Face detected"
          description={faceDetected ? 'Live face detected' : 'Position face in frame'}
        />

        <VerificationStepItem
          state={matchState}
          title="Face match"
          description={matchDesc}
        />

        <VerificationStepItem
          state={livenessState}
          title="Liveness"
          description={livenessDesc}
        />

        <VerificationStepItem
          state={locationState}
          title="Location"
          description={locationDesc}
        />

        <VerificationStepItem
          state={geofenceState}
          title="Office boundary"
          description={geofenceDesc}
          isLast
        />
      </div>

      {/* Progressive Disclosure: Details */}
      <div>
        <button
          type="button"
          className="apple-details-toggle-btn"
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          aria-expanded={detailsExpanded}
        >
          <span>{detailsExpanded ? 'Hide Details' : 'Details'}</span>
          {detailsExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
        </button>

        {detailsExpanded && (
          <div className="apple-details-pane">
            <div className="apple-details-row">
              <span>GPS Precision</span>
              <span>{userCoords ? `±${Math.round(userCoords.accuracy)} m` : '--'}</span>
            </div>
            <div className="apple-details-row">
              <span>Office Geofence</span>
              <span>{office?.radius_meters || 150} m radius</span>
            </div>
            <div className="apple-details-row">
              <span>Face Clarity</span>
              <span>{(qualityScore * 100).toFixed(0)}%</span>
            </div>
            <div className="apple-details-row">
              <span>Liveness Score</span>
              <span>{(livenessScore * 100).toFixed(0)}%</span>
            </div>
            {locationVerification?.latencyMs && (
              <div className="apple-details-row">
                <span>Location Latency</span>
                <span>{locationVerification.latencyMs} ms ({locationVerification.matchType})</span>
              </div>
            )}
            {userCoords && (
              <div className="apple-details-row">
                <span>User Coordinates</span>
                <span>{userCoords.lat.toFixed(5)}, {userCoords.lon.toFixed(5)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Area */}
      <div className="apple-action-area">
        <div className="apple-action-status-block">
          {isReady ? (
            <>
              <div className="apple-action-status-title ready">
                <CheckOutlined style={{ fontSize: 14 }} />
                <span>{isCheckOut ? 'Ready to check out' : 'Ready to check in'}</span>
              </div>
              <div className="apple-action-status-desc">
                Face verified · Inside office boundary
              </div>
            </>
          ) : (
            <>
              <div className="apple-action-status-title unavailable">
                <span>{isCheckOut ? 'Check-out unavailable' : 'Check-in unavailable'}</span>
              </div>
              <div className="apple-action-status-desc">
                {unavailableReason}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="apple-checkin-btn"
          disabled={!isReady}
          onClick={handlePrimaryAction}
        >
          <SafetyCertificateOutlined />
          <span>
            {submitting
              ? (isCheckOut ? 'Checking out...' : 'Checking in...')
              : (isCheckOut ? 'Check Out' : 'Check In')}
          </span>
        </button>

        {/* Actionable recovery links */}
        {(showRetryLocation || showUpdateFace) && (
          <div className="apple-action-secondary-row">
            {showRetryLocation && (
              <button
                type="button"
                className="apple-action-secondary-btn"
                onClick={onRefreshLocation}
              >
                <ReloadOutlined style={{ fontSize: 11 }} />
                <span>Retry Location</span>
              </button>
            )}
            {showUpdateFace && (
              <button
                type="button"
                className="apple-action-secondary-btn"
                onClick={onNavigateToEnrollment}
              >
                <span>Update Reference Face</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
