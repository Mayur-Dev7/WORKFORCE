import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  Input,
  DatePicker,
  message,
  Typography,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Empty,
  Drawer,
  Progress,
  Alert,
} from 'antd';

message.config({
  maxCount: 1,
  duration: 3,
});
import {
  PlusOutlined,
  CalendarOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { LeaveRequest, LeaveBalance, LeaveType } from '@workforce/shared';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { ResponsiveDateRangePicker } from '../../components/common/ResponsiveDateRangePicker.js';
import {
  getMyLeaveRequests,
  applyLeave,
  cancelMyLeaveRequest,
  getMyLeaveBalances,
  getLeaveTypes,
} from '../../services/leave.api.js';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING: <ClockCircleOutlined />,
  APPROVED: <CheckCircleOutlined />,
  REJECTED: <CloseCircleOutlined />,
  CANCELLED: <StopOutlined />,
};

/** Mobile leave request card — shown instead of the table on small screens */
const LeaveCard: React.FC<{
  r: LeaveRequest;
  onCancel: (id: string) => void;
  cancellingId: string | null;
}> = ({ r, onCancel, cancellingId }) => (
  <Card
    size="small"
    style={{ marginBottom: 10, borderRadius: 10 }}
    styles={{ body: { padding: '12px 14px' } }}
  >
    {/* Top row: type + status */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
      <div>
        <Text strong style={{ fontSize: 15 }}>{r.leave_type_name}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>{r.leave_type_code}</Text>
      </div>
      <Tag
        color={STATUS_COLOR[r.status]}
        icon={STATUS_ICON[r.status]}
        style={{ fontSize: 12, marginLeft: 8 }}
      >
        {r.status}
      </Tag>
    </div>

    {/* Dates + days */}
    <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>FROM</Text>
        <br />
        <Text strong style={{ fontSize: 13 }}>{dayjs(r.start_date).format('DD MMM YYYY')}</Text>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>TO</Text>
        <br />
        <Text strong style={{ fontSize: 13 }}>{dayjs(r.end_date).format('DD MMM YYYY')}</Text>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>DAYS</Text>
        <br />
        <Tag color="blue" style={{ margin: 0 }}>{r.days_requested} day{r.days_requested !== 1 ? 's' : ''}</Tag>
      </div>
    </div>

    {/* Reason / note */}
    {r.reason && (
      <div style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>REASON: </Text>
        <Text style={{ fontSize: 13 }}>{r.reason}</Text>
      </div>
    )}
    {r.reviewer_note && (
      <div style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>REVIEWER NOTE: </Text>
        <Text style={{ fontSize: 13 }}>{r.reviewer_note}</Text>
      </div>
    )}

    {/* Footer: applied on + cancel */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 11 }}>
        Applied {dayjs(r.created_at).format('DD MMM YYYY')}
      </Text>
      {r.status === 'PENDING' && (
        <Popconfirm
          title="Cancel this leave request?"
          onConfirm={() => onCancel(r.id)}
          okText="Yes, Cancel"
          cancelText="No"
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={cancellingId === r.id}
          >
            Cancel
          </Button>
        </Popconfirm>
      )}
    </div>
  </Card>
);

export const LeavePage: React.FC = () => {
  const { hasPermission } = useAuth();
  const currentYear = dayjs().year();

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterYear, setFilterYear] = useState<number>(currentYear);

  // Apply modal (Drawer on mobile)
  const [applyVisible, setApplyVisible] = useState(false);
  const [applyForm] = Form.useForm();
  const [applying, setApplying] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isMobile = useIsMobile(768);

  const selectedLeaveTypeId = Form.useWatch('leave_type_id', applyForm);

  const selectedBalance = useMemo(
    () => balances.find((b) => b.leave_type_id === selectedLeaveTypeId),
    [balances, selectedLeaveTypeId]
  );

  const selectedType = useMemo(
    () => leaveTypes.find((t) => t.id === selectedLeaveTypeId),
    [leaveTypes, selectedLeaveTypeId]
  );

  const availableDays = useMemo(() => {
    if (!selectedBalance) return 0;
    return Number(
      selectedBalance.remaining_days ??
        (selectedBalance.allocated_days - selectedBalance.used_days - selectedBalance.pending_days)
    );
  }, [selectedBalance]);

  // Calculate requested working days (excluding Sundays, matching corporate calendar)
  const requestedWorkingDays = useMemo(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return 0;
    const start = dateRange[0].startOf('day');
    const end = dateRange[1].startOf('day');
    if (end.isBefore(start)) return 0;

    let count = 0;
    let curr = start;
    while (curr.isBefore(end) || curr.isSame(end, 'day')) {
      if (curr.day() !== 0) {
        count++;
      }
      curr = curr.add(1, 'day');
    }
    return count;
  }, [dateRange]);

  const hasSelectedDates = Boolean(dateRange && dateRange[0] && dateRange[1]);
  const isCrossingLimit = Boolean(
    selectedLeaveTypeId &&
    hasSelectedDates &&
    requestedWorkingDays > availableDays
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [balRes, reqRes, typesRes] = await Promise.all([
        getMyLeaveBalances(filterYear),
        getMyLeaveRequests({ year: filterYear, status: filterStatus }),
        getLeaveTypes(),
      ]);
      setBalances(balRes.data.data);
      setRequests(reqRes.data.data);
      setLeaveTypes(typesRes.data.data);
    } catch {
      message.error({ content: 'Failed to load leave data', key: 'leave-action-toast' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [filterYear, filterStatus]);

  const handleApply = async (values: any) => {
    if (applying) return; // Prevent double-clicks from rapid tapping

    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.error({ content: 'Please select a date range', key: 'leave-action-toast' });
      return;
    }

    if (isCrossingLimit) {
      message.error({
        content: `Insufficient leave balance. Requested: ${requestedWorkingDays} day(s), Available: ${availableDays.toFixed(2)} day(s)`,
        key: 'leave-action-toast',
      });
      return;
    }

    setApplying(true);
    try {
      await applyLeave({
        leave_type_id: values.leave_type_id,
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
        reason: values.reason || '',
      });
      message.success({ content: 'Leave application submitted successfully', key: 'leave-action-toast' });
      setApplyVisible(false);
      applyForm.resetFields();
      setDateRange(null);
      fetchAll();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to apply for leave';
      message.error({ content: msg, key: 'leave-action-toast' });
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelMyLeaveRequest(id);
      message.success({ content: 'Leave request cancelled', key: 'leave-action-toast' });
      fetchAll();
    } catch (err: any) {
      message.error({ content: err.response?.data?.error?.message || 'Failed to cancel request', key: 'leave-action-toast' });
    } finally {
      setCancellingId(null);
    }
  };

  // Desktop table columns
  const columns: ColumnsType<LeaveRequest> = [
    {
      title: 'Leave Type',
      key: 'leave_type',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.leave_type_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.leave_type_code}</Text>
        </Space>
      ),
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text>{dayjs(r.start_date).format('DD MMM YYYY')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>to {dayjs(r.end_date).format('DD MMM YYYY')}</Text>
        </Space>
      ),
    },
    {
      title: 'Days',
      dataIndex: 'days_requested',
      key: 'days',
      render: (d: number) => <Tag color="blue">{d} day{d !== 1 ? 's' : ''}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]} icon={STATUS_ICON[s]}>{s}</Tag>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string | null) => r || <Text type="secondary">—</Text>,
    },
    {
      title: 'Applied On',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d: string) => dayjs(d).format('DD MMM YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) =>
        r.status === 'PENDING' ? (
          <Popconfirm
            title="Cancel this leave request?"
            onConfirm={() => handleCancel(r.id)}
            okText="Yes, Cancel"
            cancelText="No"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={cancellingId === r.id}
            >
              Cancel
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const canApply = hasPermission(PermissionKey.LEAVE_APPLY);

  // Shared Apply Form content (used in both Modal and Drawer)
  const ApplyFormContent = (
    <Form form={applyForm} layout="vertical" onFinish={handleApply}>
      <Form.Item
        name="leave_type_id"
        label="Leave Type"
        rules={[{ required: true, message: 'Please select a leave type' }]}
      >
        <Select placeholder="Select leave type" size="large">
          {leaveTypes.filter((t) => t.is_active).map((t) => (
            <Select.Option key={t.id} value={t.id}>
              {t.name} ({t.annual_quota} days/year) {t.is_paid ? '• Paid' : '• Unpaid'}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item label="Date Range" required>
        <ResponsiveDateRangePicker
          style={{ width: '100%' }}
          size="large"
          value={dateRange}
          onChange={(val) => setDateRange(val)}
          disabledDate={(d) => Boolean(d && d < dayjs().startOf('day'))}
          format="DD MMM YYYY"
          maxDays={selectedLeaveTypeId ? availableDays : undefined}
        />
      </Form.Item>

      {/* Dynamic Quota & Balance Feedback Alert — Clean single-line */}
      {selectedLeaveTypeId && (
        <div style={{ marginBottom: 14 }}>
          {isCrossingLimit ? (
            <Alert
              type="error"
              showIcon
              style={{ borderRadius: 8, padding: '8px 12px' }}
              message={
                <span>
                  <strong>Insufficient balance:</strong> {requestedWorkingDays} days requested, but only {availableDays.toFixed(1)} available
                </span>
              }
            />
          ) : hasSelectedDates ? (
            <Alert
              type="success"
              showIcon
              style={{ borderRadius: 8, padding: '8px 12px' }}
              message={
                <span>
                  {requestedWorkingDays} days requested • {availableDays.toFixed(1)} available ({(availableDays - requestedWorkingDays).toFixed(1)} left)
                </span>
              }
            />
          ) : (
            <div style={{ fontSize: 12, color: '#6b7280', padding: '2px 4px' }}>
              Available quota: <strong>{availableDays.toFixed(1)} days</strong>
            </div>
          )}
        </div>
      )}

      <Form.Item name="reason" label="Reason (optional)">
        <TextArea rows={3} placeholder="Reason for your leave" />
      </Form.Item>

      <Button
        type="primary"
        htmlType="submit"
        loading={applying}
        disabled={applying || isCrossingLimit}
        danger={isCrossingLimit}
        block
        size="large"
        style={{ marginTop: 8, height: 44, borderRadius: 8 }}
      >
        {isCrossingLimit
          ? `Cannot Submit (Exceeds ${availableDays.toFixed(1)}d Limit)`
          : 'Submit Application'}
      </Button>
    </Form>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header + Apply Button ─────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <CalendarOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            My Leave
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>View your balances and manage requests</Text>
        </div>
        {canApply && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setApplyVisible(true)}
            style={{ borderRadius: 8 }}
          >
            Apply for Leave
          </Button>
        )}
      </div>

      {/* ── Leave Balance Cards ────────────────────── */}
      {balances.length === 0 ? (
        <Card style={{ borderRadius: 12, marginBottom: 14 }}>
          <Empty description="No leave balances allocated for this year" />
        </Card>
      ) : (
        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          {balances.map((b) => {
            const remaining = b.remaining_days ?? (b.allocated_days - b.used_days - b.pending_days);
            const pct = b.allocated_days > 0 ? Math.round((remaining / b.allocated_days) * 100) : 0;
            return (
              <Col key={b.id} xs={24} sm={12} md={8}>
                <Card
                  size="small"
                  style={{ borderRadius: 12, border: '1px solid #e8e8e8' }}
                  styles={{ body: { padding: '14px 16px' } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <Text strong style={{ fontSize: 15 }}>{b.leave_type_name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>{b.leave_type_code}</Text>
                    </div>
                    <Tag color={remaining > 0 ? 'green' : 'red'} style={{ fontSize: 13, margin: 0 }}>
                      {remaining} left
                    </Tag>
                  </div>
                  <Progress
                    percent={pct}
                    size="small"
                    strokeColor={remaining > 2 ? '#52c41a' : '#ff4d4f'}
                    showInfo={false}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Total: <strong>{b.allocated_days} days</strong></Text>
                    <Space size={4}>
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>Used: {b.used_days}</Tag>
                      {b.pending_days > 0 && (
                        <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Pending: {b.pending_days}</Tag>
                      )}
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* ── Leave History ─────────────────────────── */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '14px 16px' } }}>
        {/* History header + filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <Title level={5} style={{ margin: 0 }}>Leave History</Title>
          <Space size={8} wrap>
            <Select
              value={filterYear}
              onChange={setFilterYear}
              style={{ width: 90 }}
              size="small"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <Select.Option key={y} value={y}>{y}</Select.Option>
              ))}
            </Select>
            <Select
              placeholder="All status"
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 130 }}
              size="small"
            >
              {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
                <Select.Option key={s} value={s}>{s}</Select.Option>
              ))}
            </Select>
          </Space>
        </div>

        {requests.length === 0 && !loading ? (
          <Empty description="No leave requests found" style={{ padding: '24px 0' }} />
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="leave-card-list">
              {loading
                ? <Empty description="Loading..." />
                : requests.map((r) => (
                    <LeaveCard key={r.id} r={r} onCancel={handleCancel} cancellingId={cancellingId} />
                  ))}
            </div>

            {/* Desktop: table */}
            <div className="leave-table-desktop">
              <Table
                dataSource={requests}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: <Empty description="No leave requests found" /> }}
                size="small"
              />
            </div>
          </>
        )}
      </Card>

      {/* ── Apply Leave — Drawer on mobile, Modal on desktop ─── */}
      {/* Mobile Drawer */}
      <Drawer
        title="Apply for Leave"
        placement="bottom"
        height="auto"
        open={applyVisible && isMobile}
        onClose={() => { setApplyVisible(false); applyForm.resetFields(); setDateRange(null); }}
        className="leave-apply-drawer"
        styles={{ body: { paddingBottom: 'env(safe-area-inset-bottom, 16px)' } }}
      >
        {ApplyFormContent}
      </Drawer>

      {/* Desktop Modal */}
      <Modal
        title="Apply for Leave"
        open={applyVisible && !isMobile}
        onCancel={() => { setApplyVisible(false); applyForm.resetFields(); setDateRange(null); }}
        footer={null}
        destroyOnClose
        width={480}
      >
        {ApplyFormContent}
      </Modal>
    </div>
  );
};
