import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export type StepState = 'verified' | 'failed' | 'checking' | 'waiting';

interface VerificationStepItemProps {
  state: StepState;
  title: string;
  description: string;
  isLast?: boolean;
}

export const VerificationStepItem: React.FC<VerificationStepItemProps> = ({
  state,
  title,
  description,
  isLast = false,
}) => {
  let iconContent: React.ReactNode = null;
  let ariaLabel = '';

  switch (state) {
    case 'verified':
      iconContent = '✓';
      ariaLabel = `${title}: Verified`;
      break;
    case 'failed':
      iconContent = '×';
      ariaLabel = `${title}: Failed`;
      break;
    case 'checking':
      iconContent = <LoadingOutlined style={{ fontSize: 11 }} />;
      ariaLabel = `${title}: Checking`;
      break;
    case 'waiting':
    default:
      iconContent = '○';
      ariaLabel = `${title}: Waiting`;
      break;
  }

  return (
    <div className="apple-step-row" role="listitem" aria-label={ariaLabel}>
      {!isLast && <div className="apple-step-connector" aria-hidden="true" />}
      <div className={`apple-step-icon ${state}`} aria-hidden="true">
        {iconContent}
      </div>
      <div className="apple-step-content">
        <div className="apple-step-title">{title}</div>
        <div className={`apple-step-desc ${state === 'failed' ? 'error' : ''}`}>
          {description}
        </div>
      </div>
    </div>
  );
};
