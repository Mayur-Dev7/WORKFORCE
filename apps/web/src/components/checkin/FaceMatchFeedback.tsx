import React from 'react';
import { CheckOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';

interface FaceMatchFeedbackProps {
  faceDetected: boolean;
  faceMatched: boolean;
  faceSimilarity: number;
  expectedName?: string;
  expectedCode?: string;
  faceEnrolled?: boolean;
}

export const FaceMatchFeedback: React.FC<FaceMatchFeedbackProps> = ({
  faceDetected,
  faceMatched,
  faceSimilarity,
  expectedName = 'Employee',
  expectedCode,
  faceEnrolled = true,
}) => {
  let statusText = 'Waiting for face';
  let statusClass = 'waiting';
  let icon: React.ReactNode = null;

  if (!faceEnrolled) {
    statusText = 'No reference photo enrolled';
    statusClass = 'mismatch';
    icon = <CloseOutlined style={{ fontSize: 14 }} />;
  } else if (!faceDetected) {
    statusText = 'Position face in frame';
    statusClass = 'waiting';
    icon = <span style={{ fontSize: 13 }}>○</span>;
  } else if (faceMatched) {
    statusText = `Verified · ${faceSimilarity}% match`;
    statusClass = 'verified';
    icon = <CheckOutlined style={{ fontSize: 15 }} />;
  } else {
    statusText = `Mismatch · ${faceSimilarity}% match`;
    statusClass = 'mismatch';
    icon = <CloseOutlined style={{ fontSize: 14 }} />;
  }

  return (
    <div className="apple-face-feedback-card" aria-label="Biometric face verification status">
      <div>
        <div className="apple-feedback-heading">Face Verification</div>
        <div className={`apple-feedback-status ${statusClass}`}>
          {icon}
          <span>{statusText}</span>
        </div>
      </div>

      <div className="apple-feedback-expected">
        <span>Expected: </span>
        <strong>{expectedName}</strong>
        {expectedCode && <span style={{ color: '#86868b' }}> · {expectedCode}</span>}
      </div>
    </div>
  );
};
