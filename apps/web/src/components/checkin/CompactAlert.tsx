import React from 'react';
import { Button } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';

interface CompactAlertProps {
  type?: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
  loading?: boolean;
}

export const CompactAlert: React.FC<CompactAlertProps> = ({
  type = 'error',
  title,
  message,
  actionText,
  onAction,
  loading = false,
}) => {
  return (
    <div className={`apple-inline-alert ${type}`} role="alert">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="apple-inline-alert-title">{title}</div>
        <div className="apple-inline-alert-desc">{message}</div>
      </div>
      {actionText && onAction && (
        <Button
          size="small"
          onClick={onAction}
          loading={loading}
          icon={<ReloadOutlined />}
          style={{
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {actionText}
        </Button>
      )}
    </div>
  );
};
