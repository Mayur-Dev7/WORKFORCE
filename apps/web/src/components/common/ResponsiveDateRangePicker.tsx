import React, { useState, useEffect, useMemo } from 'react';
import { DatePicker, Modal, Button, Typography, Tag, Space } from 'antd';
import {
  CalendarOutlined,
  SwapRightOutlined,
  LeftOutlined,
  RightOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  CloseCircleFilled,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface ResponsiveDateRangePickerProps {
  value?: [Dayjs | null, Dayjs | null] | null;
  onChange?: (dates: [Dayjs | null, Dayjs | null] | null) => void;
  disabledDate?: (currentDate: Dayjs) => boolean;
  format?: string;
  size?: 'small' | 'middle' | 'large';
  placeholder?: [string, string];
  style?: React.CSSProperties;
  className?: string;
  allowClear?: boolean;
}

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const ResponsiveDateRangePicker: React.FC<ResponsiveDateRangePickerProps> = ({
  value,
  onChange,
  disabledDate,
  format = 'DD MMM YYYY',
  size = 'large',
  placeholder = ['Start date', 'End date'],
  style,
  className,
  allowClear = true,
}) => {
  const isMobile = useIsMobile(768);

  // Desktop branch: standard Ant Design RangePicker
  if (!isMobile) {
    return (
      <RangePicker
        value={value}
        onChange={onChange}
        disabledDate={disabledDate}
        format={format}
        size={size}
        placeholder={placeholder}
        style={{ width: '100%', ...style }}
        className={className}
        allowClear={allowClear}
      />
    );
  }

  // Mobile branch: Read-only button trigger + Dedicated Touch-Optimized Calendar Modal
  return (
    <MobileDateRangePickerInner
      value={value}
      onChange={onChange}
      disabledDate={disabledDate}
      format={format}
      size={size}
      placeholder={placeholder}
      style={style}
      className={className}
      allowClear={allowClear}
    />
  );
};

const MobileDateRangePickerInner: React.FC<ResponsiveDateRangePickerProps> = ({
  value,
  onChange,
  disabledDate,
  format = 'DD MMM YYYY',
  size = 'large',
  placeholder = ['Start date', 'End date'],
  style,
  className,
  allowClear = true,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Dayjs | null>(value?.[0] || null);
  const [tempEnd, setTempEnd] = useState<Dayjs | null>(value?.[1] || null);
  const [activeStep, setActiveStep] = useState<'start' | 'end'>('start');
  const [viewMonth, setViewMonth] = useState<Dayjs>(() => {
    return value?.[0] ? value[0].startOf('month') : dayjs().startOf('month');
  });

  // Sync internal modal state whenever the modal opens or value changes
  useEffect(() => {
    if (modalOpen) {
      const initialStart = value?.[0] || null;
      const initialEnd = value?.[1] || null;
      setTempStart(initialStart);
      setTempEnd(initialEnd);
      setActiveStep(initialStart && !initialEnd ? 'end' : 'start');
      setViewMonth((initialStart || dayjs()).startOf('month'));
    }
  }, [modalOpen, value]);

  const hasValue = Boolean(value?.[0] && value?.[1]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleApply = () => {
    if (tempStart && tempEnd) {
      onChange?.([tempStart, tempEnd]);
      setModalOpen(false);
    }
  };

  // Calendar click handler following natural mobile date range selection
  const handleDaySelect = (date: Dayjs) => {
    if (disabledDate && disabledDate(date)) return;

    if (activeStep === 'start') {
      setTempStart(date);
      // If an existing end date is before the newly selected start date, clear it
      if (tempEnd && date.isAfter(tempEnd, 'day')) {
        setTempEnd(null);
      }
      setActiveStep('end');
    } else {
      // activeStep === 'end'
      if (!tempStart) {
        setTempStart(date);
        setActiveStep('end');
      } else if (date.isBefore(tempStart, 'day')) {
        // Tapped earlier than start date: set this as new start date, stay in 'end' mode
        setTempStart(date);
        setTempEnd(null);
        setActiveStep('end');
      } else if (tempStart && tempEnd && !date.isSame(tempEnd, 'day')) {
        // Both already picked and user clicked a new date: start fresh selection
        setTempStart(date);
        setTempEnd(null);
        setActiveStep('end');
      } else {
        // Normal end date selection (>= tempStart)
        setTempEnd(date);
      }
    }
  };

  // Build grid calendar days
  const today = useMemo(() => dayjs().startOf('day'), []);
  const daysInMonth = viewMonth.daysInMonth();
  const startDayOfWeek = viewMonth.startOf('month').day(); // 0 is Sunday

  const daysGrid = useMemo(() => {
    const cells: Array<{
      date: Dayjs | null;
      dayNum?: number;
      disabled: boolean;
      isToday: boolean;
      isStart: boolean;
      isEnd: boolean;
      isInRange: boolean;
      isSingleDay: boolean;
    }> = [];

    // Leading blanks before 1st of month
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({
        date: null,
        disabled: true,
        isToday: false,
        isStart: false,
        isEnd: false,
        isInRange: false,
        isSingleDay: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = viewMonth.date(d);
      const disabled = disabledDate ? Boolean(disabledDate(date)) : false;
      const isToday = date.isSame(today, 'day');
      const isStart = Boolean(tempStart && date.isSame(tempStart, 'day'));
      const isEnd = Boolean(tempEnd && date.isSame(tempEnd, 'day'));
      const isInRange = Boolean(
        tempStart && tempEnd && date.isAfter(tempStart, 'day') && date.isBefore(tempEnd, 'day')
      );
      const isSingleDay = Boolean(isStart && isEnd);

      cells.push({
        date,
        dayNum: d,
        disabled,
        isToday,
        isStart,
        isEnd,
        isInRange,
        isSingleDay,
      });
    }

    return cells;
  }, [viewMonth, tempStart, tempEnd, disabledDate, today, startDayOfWeek, daysInMonth]);

  const selectedDurationDays = useMemo(() => {
    if (tempStart && tempEnd) {
      return tempEnd.diff(tempStart, 'day') + 1;
    }
    return 0;
  }, [tempStart, tempEnd]);

  // Height and padding based on size prop
  const minHeight = size === 'large' ? 44 : size === 'small' ? 32 : 38;
  const padding = size === 'large' ? '8px 12px' : size === 'small' ? '4px 8px' : '6px 11px';

  return (
    <>
      {/* ── Mobile Non-Editable / Selection-Only Trigger ── */}
      {/* This is a read-only button trigger with NO input tag, so Android keyboard NEVER opens */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={
          hasValue
            ? `Date Range: ${value![0]!.format(format)} to ${value![1]!.format(format)}`
            : 'Date Range: Select start date and end date'
        }
        onClick={() => setModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        className={`ant-picker ${size === 'large' ? 'ant-picker-large' : size === 'small' ? 'ant-picker-small' : ''} ${className || ''}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight,
          padding,
          borderRadius: 8,
          border: '1px solid #d9d9d9',
          background: '#ffffff',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxSizing: 'border-box',
          transition: 'all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              color: value?.[0] ? '#1f2937' : '#9ca3af',
              fontSize: 14,
              fontWeight: value?.[0] ? 500 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value?.[0] ? value[0].format(format) : placeholder[0]}
          </span>

          <SwapRightOutlined style={{ color: '#bfbfbf', fontSize: 16, flexShrink: 0 }} />

          <span
            style={{
              color: value?.[1] ? '#1f2937' : '#9ca3af',
              fontSize: 14,
              fontWeight: value?.[1] ? 500 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value?.[1] ? value[1].format(format) : placeholder[1]}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
          {allowClear && hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear dates"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  handleClear(e as any);
                }
              }}
              style={{
                color: '#bfbfbf',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px 4px',
              }}
            >
              <CloseCircleFilled />
            </span>
          )}
          <CalendarOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />
        </div>
      </div>

      {/* ── Mobile Calendar Modal (Touch-First & Keyboard-Free) ── */}
      <Modal
        open={modalOpen}
        onCancel={handleCancel}
        footer={null}
        destroyOnClose
        centered
        zIndex={1100}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Date Range</span>
          </div>
        }
        width={380}
        styles={{
          body: { padding: '12px 14px 16px', userSelect: 'none' },
        }}
        style={{
          maxWidth: 'calc(100vw - 20px)',
          margin: '0 auto',
        }}
      >
        {/* Step / Range Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {/* Start Date Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setActiveStep('start')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 10,
              border: `2px solid ${activeStep === 'start' ? '#1677ff' : '#e5e7eb'}`,
              background: activeStep === 'start' ? '#eff6ff' : '#fafafa',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: activeStep === 'start' ? '#1677ff' : '#8c8c8c',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Start Date
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: tempStart ? 600 : 400,
                color: tempStart ? '#111827' : '#9ca3af',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tempStart ? tempStart.format('DD MMM YYYY') : 'Not selected'}
            </div>
          </div>

          <SwapRightOutlined style={{ color: '#9ca3af', fontSize: 16, flexShrink: 0 }} />

          {/* End Date Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setActiveStep('end')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 10,
              border: `2px solid ${activeStep === 'end' ? '#1677ff' : '#e5e7eb'}`,
              background: activeStep === 'end' ? '#eff6ff' : '#fafafa',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: activeStep === 'end' ? '#1677ff' : '#8c8c8c',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              End Date
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: tempEnd ? 600 : 400,
                color: tempEnd ? '#111827' : '#9ca3af',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tempEnd ? tempEnd.format('DD MMM YYYY') : 'Not selected'}
            </div>
          </div>
        </div>

        {/* Dynamic Instructional Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            padding: '4px 6px',
            background: '#f9fafb',
            borderRadius: 6,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.3 }}>
            {activeStep === 'start'
              ? '👉 Tap a date for Start Date'
              : !tempStart
              ? '👉 Tap a date for Start Date'
              : !tempEnd
              ? '👉 Tap a date for End Date'
              : '✅ Range chosen. Tap Apply to confirm.'}
          </Text>
          {selectedDurationDays > 0 && (
            <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>
              {selectedDurationDays} {selectedDurationDays === 1 ? 'day' : 'days'}
            </Tag>
          )}
        </div>

        {/* ── Month & Year Navigation ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderTop: '1px solid #f0f0f0',
            borderBottom: '1px solid #f0f0f0',
            marginBottom: 6,
          }}
        >
          <div style={{ display: 'flex', gap: 2 }}>
            <Button
              type="text"
              size="small"
              icon={<DoubleLeftOutlined />}
              onClick={() => setViewMonth(viewMonth.subtract(1, 'year'))}
              aria-label="Previous year"
              style={{ minHeight: 32, width: 32 }}
            />
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined />}
              onClick={() => setViewMonth(viewMonth.subtract(1, 'month'))}
              aria-label="Previous month"
              style={{ minHeight: 32, width: 32 }}
            />
          </div>

          <Text strong style={{ fontSize: 14 }}>
            {viewMonth.format('MMMM YYYY')}
          </Text>

          <div style={{ display: 'flex', gap: 2 }}>
            <Button
              type="text"
              size="small"
              icon={<RightOutlined />}
              onClick={() => setViewMonth(viewMonth.add(1, 'month'))}
              aria-label="Next month"
              style={{ minHeight: 32, width: 32 }}
            />
            <Button
              type="text"
              size="small"
              icon={<DoubleRightOutlined />}
              onClick={() => setViewMonth(viewMonth.add(1, 'year'))}
              aria-label="Next year"
              style={{ minHeight: 32, width: 32 }}
            />
          </div>
        </div>

        {/* ── Weekday Labels ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            textAlign: 'center',
            padding: '4px 0 2px',
          }}
        >
          {WEEKDAY_NAMES.map((name) => (
            <div key={name} style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c' }}>
              {name}
            </div>
          ))}
        </div>

        {/* ── Day Cells Grid ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            rowGap: 4,
            padding: '2px 0 8px',
          }}
        >
          {daysGrid.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`blank-${idx}`} style={{ height: 40 }} />;
            }

            const { date, dayNum, disabled, isToday, isStart, isEnd, isInRange, isSingleDay } = cell;

            // Range background connection styling
            let cellBg = 'transparent';
            let borderRadius = '0';

            if (isInRange) {
              cellBg = '#e6f4ff';
            } else if (isStart && tempEnd && !isSingleDay) {
              cellBg = 'linear-gradient(to right, transparent 50%, #e6f4ff 50%)';
            } else if (isEnd && tempStart && !isSingleDay) {
              cellBg = 'linear-gradient(to left, transparent 50%, #e6f4ff 50%)';
            }

            return (
              <div
                key={date.format('YYYY-MM-DD')}
                style={{
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: cellBg,
                  borderRadius,
                  position: 'relative',
                }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDaySelect(date)}
                  aria-label={`${date.format('dddd, DD MMMM YYYY')}${isStart ? ' (Start Date)' : ''}${isEnd ? ' (End Date)' : ''}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: isToday && !isStart && !isEnd ? '1px solid #1677ff' : 'none',
                    background: isStart || isEnd ? '#1677ff' : 'transparent',
                    color: isStart || isEnd ? '#ffffff' : disabled ? '#d1d5db' : isToday ? '#1677ff' : '#1f2937',
                    fontWeight: isStart || isEnd || isToday ? 600 : 400,
                    fontSize: 13,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: isStart || isEnd ? '0 2px 6px rgba(22, 119, 255, 0.35)' : 'none',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  {dayNum}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Modal Footer Actions ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
          <Button
            size="large"
            onClick={handleCancel}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            Cancel
          </Button>

          <Button
            type="primary"
            size="large"
            disabled={!tempStart || !tempEnd}
            onClick={handleApply}
            style={{
              flex: 1.3,
              height: 44,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              background: tempStart && tempEnd ? '#1677ff' : undefined,
            }}
          >
            {tempStart && tempEnd ? `Apply (${selectedDurationDays}d)` : 'Apply / Done'}
          </Button>
        </div>
      </Modal>
    </>
  );
};
