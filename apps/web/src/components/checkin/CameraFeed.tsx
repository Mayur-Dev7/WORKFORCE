import React, { RefObject } from 'react';

interface CameraFeedProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  faceDetected: boolean;
  faceMatched: boolean;
  livenessPassed: boolean;
  livenessInstruction: string;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  videoRef,
  cameraReady,
  faceDetected,
  faceMatched,
  livenessPassed,
  livenessInstruction,
}) => {
  // Determine understated guidance frame styling
  let frameClass = '';
  if (faceDetected) {
    if (faceMatched && livenessPassed) {
      frameClass = 'detected';
    } else if (!faceMatched) {
      frameClass = 'error';
    } else {
      frameClass = 'warning';
    }
  }

  return (
    <div className="apple-camera-surface" aria-label="Live camera feed for biometric face verification">
      <video
        ref={videoRef as any}
        playsInline
        muted
        className="apple-camera-video"
      />

      {/* Subtle Top-Left Status Indicator */}
      <div className="apple-camera-live-pill" aria-live="off">
        <span
          className={`apple-live-dot ${cameraReady ? '' : 'initializing'}`}
          aria-hidden="true"
        />
        <span>{cameraReady ? 'Live' : 'Initializing...'}</span>
      </div>

      {/* Understated Face Detection Guidance Frame */}
      <div
        className={`apple-face-guide ${frameClass}`}
        aria-hidden="true"
      />

      {/* Live Guidance Pill (Bottom of Camera) */}
      <div className="apple-camera-guidance" role="status" aria-live="polite">
        {livenessInstruction}
      </div>
    </div>
  );
};
