import React from 'react';
import { Button } from 'antd';
import { UserOutlined, EditOutlined } from '@ant-design/icons';

interface ReferenceFaceCardProps {
  referenceImage: string | null;
  faceEnrolled: boolean;
  onUpdate: () => void;
}

export const ReferenceFaceCard: React.FC<ReferenceFaceCardProps> = ({
  referenceImage,
  faceEnrolled,
  onUpdate,
}) => {
  return (
    <div className="apple-ref-face-card">
      <div className="apple-ref-face-info">
        {referenceImage ? (
          <img
            src={referenceImage}
            alt="Enrolled reference profile"
            className="apple-ref-face-thumb"
          />
        ) : (
          <div className="apple-ref-face-placeholder">
            <UserOutlined />
          </div>
        )}
        <div>
          <div className="apple-ref-face-label">Reference Face</div>
          <div className="apple-ref-face-desc">
            {faceEnrolled ? 'Enrolled · Reference image available' : 'No reference face photo enrolled'}
          </div>
        </div>
      </div>

      <Button
        size="small"
        icon={<EditOutlined />}
        onClick={onUpdate}
        style={{
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 500,
        }}
      >
        {faceEnrolled ? 'Update' : 'Register'}
      </Button>
    </div>
  );
};
