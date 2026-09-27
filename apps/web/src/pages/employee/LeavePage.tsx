import React, { useEffect, useState } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  CalendarOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { LeaveRequest, LeaveBalance, LeaveType } from '@workforce/shared';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import {
  getMyLeaveRequests,
  applyLeave,
  cancelMyLeaveRequest,
  getMyLeaveBalances,
  getLeaveTypes,
} from '../../services/leave.api.js';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

export const LeavePage: React.FC = () => {
  const { hasPermission } = useAuth();
  const currentYear = dayjs().year();

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterYear, setFilterYear] = useState<number>(currentYear);

  // Apply modal
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applyForm] = Form.useForm();
  const [applying, setApplying] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
      message.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [filterYear, filterStatus]);

  const handleApply = async (values: any) => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.error('Please select a date range');
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
      message.success('Leave application submitted successfully');
      setApplyModalVisible(false);
      applyForm.resetFields();
      setDateRange(null);
      fetchAll();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to apply for leave');
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelMyLeaveRequest(id);
      message.success('Leave request cancelled');
      fetchAll();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
    }
  };

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
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string | null) => r || <Text type="secondary">—</Text>,
    },
    {
      title: 'Reviewer Note',
      dataIndex: 'reviewer_note',
      key: 'reviewer_note',
      render: (n: string | null) => n || <Text type="secondary">—</Text>,
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

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Balance Cards */}
      <Card style={{ borderRadius: 12, marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              <CalendarOutlined style={{ marginRight: 8 }} />
              My Leave
            </Title>
            <Text type="secondary">View your leave balances and manage your requests</Text>
          </div>
          {canApply && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setApplyModalVisible(true)}
            >
              Apply for Leave
            </Button>
          )}
        </div>

        {balances.length === 0 ? (
          <Empty description="No leave balances allocated for this year" />
        ) : (
          <Row gutter={[16, 16]}>
            {balances.map((b) => (
              <Col key={b.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  style={{ borderRadius: 8, background: '#fafafa' }}
                  bordered
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>{b.leave_type_name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{b.leave_type_code}</Text>
                  </div>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Statistic
                        title="Remaining"
                        value={b.remaining_days ?? (b.allocated_days - b.used_days - b.pending_days)}
                        suffix="days"
                        valueStyle={{ color: '#52c41a', fontSize: 18 }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic title="Allocated" value={b.allocated_days} suffix="days" valueStyle={{ fontSize: 18 }} />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Tag color="blue">Used: {b.used_days}</Tag>
                    <Tag color="orange">Pending: {b.pending_days}</Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* Leave History */}
      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>Leave History</Title>
          <Space wrap>
            <Select
              value={filterYear}
              onChange={setFilterYear}
              style={{ width: 100 }}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <Select.Option key={y} value={y}>{y}</Select.Option>
              ))}
            </Select>
            <Select
              placeholder="Filter by status"
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 160 }}
            >
              {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
                <Select.Option key={s} value={s}>{s}</Select.Option>
              ))}
            </Select>
          </Space>
        </div>

        <Table
          dataSource={requests}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="No leave requests found" /> }}
        />
      </Card>

      {/* Apply Modal */}
      <Modal
        title="Apply for Leave"
        open={applyModalVisible}
        onCancel={() => {
          setApplyModalVisible(false);
          applyForm.resetFields();
          setDateRange(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={applyForm} layout="vertical" onFinish={handleApply}>
          <Form.Item
            name="leave_type_id"
            label="Leave Type"
            rules={[{ required: true, message: 'Please select a leave type' }]}
          >
            <Select placeholder="Select leave type">
              {leaveTypes.filter((t) => t.is_active).map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name} ({t.annual_quota} days/year) {t.is_paid ? '• Paid' : '• Unpaid'}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Date Range" required>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(val) => setDateRange(val as [Dayjs | null, Dayjs | null] | null)}
              disabledDate={(d) => d && d < dayjs().startOf('day')}
              format="DD MMM YYYY"
            />
          </Form.Item>

          <Form.Item name="reason" label="Reason">
            <TextArea rows={3} placeholder="Optional reason for leave" />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setApplyModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={applying}>
                Submit Application
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
