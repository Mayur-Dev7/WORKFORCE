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
  message,
  Typography,
  Tabs,
  Switch,
  InputNumber,
  Popconfirm,
  Pagination,
  Empty,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@workforce/shared';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import {
  getAllLeaveRequests,
  reviewLeaveRequest,
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  getAllLeaveBalances,
  allocateLeaveBalance,
  initializeLeaveYear,
} from '../../services/leave.api.js';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

export const LeaveManagementPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const { hasPermission } = useAuth();
  const currentYear = dayjs().year();
  const canApprove = hasPermission(PermissionKey.LEAVE_APPROVE);
  const canManageTypes = hasPermission(PermissionKey.LEAVE_TYPE_MANAGE);

  // ─── Requests tab ─────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [reqPage, setReqPage] = useState(1);

  // Review modal
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewForm] = Form.useForm();
  const [reviewing, setReviewing] = useState(false);

  // ─── Leave Types tab ──────────────────────────────────────────────────────
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [typeForm] = Form.useForm();
  const [savingType, setSavingType] = useState(false);

  // ─── Balances tab ─────────────────────────────────────────────────────────
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balLoading, setBalLoading] = useState(false);
  const [allocModal, setAllocModal] = useState(false);
  const [allocForm] = Form.useForm();
  const [allocating, setAllocating] = useState(false);
  const [initYear, setInitYear] = useState(false);
  const [balPage, setBalPage] = useState(1);
  const mobilePageSize = 8;

  const fetchRequests = async () => {
    setReqLoading(true);
    try {
      const res = await getAllLeaveRequests({ year: filterYear, status: filterStatus });
      setRequests(res.data.data);
    } catch {
      message.error('Failed to load leave requests');
    } finally {
      setReqLoading(false);
    }
  };

  const fetchTypes = async () => {
    setTypesLoading(true);
    try {
      const res = await getLeaveTypes();
      setLeaveTypes(res.data.data);
    } catch {
      message.error('Failed to load leave types');
    } finally {
      setTypesLoading(false);
    }
  };

  const fetchBalances = async () => {
    setBalLoading(true);
    try {
      const res = await getAllLeaveBalances(filterYear);
      setBalances(res.data.data);
    } catch {
      message.error('Failed to load balances');
    } finally {
      setBalLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchTypes();
    fetchBalances();
  }, [filterYear, filterStatus]);

  // ── Review ─────────────────────────────────────────────────────────────────
  const openReview = (req: LeaveRequest) => {
    setReviewTarget(req);
    reviewForm.resetFields();
    setReviewModal(true);
  };

  const handleReview = async (values: any) => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewLeaveRequest(reviewTarget.id, {
        action: values.action,
        reviewer_note: values.reviewer_note,
      });
      message.success(`Leave request ${values.action === 'APPROVE' ? 'approved' : 'rejected'}`);
      setReviewModal(false);
      fetchRequests();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to review request');
    } finally {
      setReviewing(false);
    }
  };

  // ── Leave Types ────────────────────────────────────────────────────────────
  const openTypeModal = (t?: LeaveType) => {
    setEditingType(t || null);
    if (t) {
      typeForm.setFieldsValue({
        code: t.code,
        name: t.name,
        annual_quota: t.annual_quota,
        is_paid: t.is_paid,
        is_active: t.is_active,
      });
    } else {
      typeForm.resetFields();
    }
    setTypeModal(true);
  };

  const handleSaveType = async (values: any) => {
    setSavingType(true);
    try {
      if (editingType) {
        await updateLeaveType(editingType.id, {
          name: values.name,
          annual_quota: values.annual_quota,
          is_paid: values.is_paid,
          is_active: values.is_active,
        });
        message.success('Leave type updated');
      } else {
        await createLeaveType({
          code: values.code,
          name: values.name,
          annual_quota: values.annual_quota,
          is_paid: values.is_paid ?? true,
        });
        message.success('Leave type created');
      }
      setTypeModal(false);
      fetchTypes();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save leave type');
    } finally {
      setSavingType(false);
    }
  };

  // ── Allocate Balance ───────────────────────────────────────────────────────
  const handleAllocate = async (values: any) => {
    setAllocating(true);
    try {
      await allocateLeaveBalance({
        user_id: values.user_id,
        leave_type_id: values.leave_type_id,
        leave_year: values.leave_year ?? filterYear,
        allocated_days: values.allocated_days,
      });
      message.success('Balance allocated successfully');
      setAllocModal(false);
      allocForm.resetFields();
      fetchBalances();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to allocate balance');
    } finally {
      setAllocating(false);
    }
  };

  const handleInitYear = async () => {
    setInitYear(true);
    try {
      await initializeLeaveYear(filterYear);
      message.success(`Leave balances initialized for ${filterYear}`);
      fetchBalances();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to initialize year');
    } finally {
      setInitYear(false);
    }
  };

  // ─── Columns ───────────────────────────────────────────────────────────────
  const requestColumns: ColumnsType<LeaveRequest> = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.user_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.employee_code}</Text>
        </Space>
      ),
    },
    {
      title: 'Leave Type',
      key: 'type',
      render: (_, r) => <Tag>{r.leave_type_name}</Tag>,
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
      render: (d: number) => <Tag color="blue">{d}d</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      render: (r: string | null) => r || <Text type="secondary">—</Text>,
    },
    {
      title: 'Applied',
      dataIndex: 'created_at',
      render: (d: string) => dayjs(d).format('DD MMM YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) =>
        canApprove && r.status === 'PENDING' ? (
          <Button size="small" type="primary" ghost onClick={() => openReview(r)}>
            Review
          </Button>
        ) : null,
    },
  ];

  const typeColumns: ColumnsType<LeaveType> = [
    { title: 'Code', dataIndex: 'code', render: (v) => <Tag>{v}</Tag> },
    { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: 'Annual Quota',
      dataIndex: 'annual_quota',
      render: (v) => `${v} days`,
    },
    {
      title: 'Paid',
      dataIndex: 'is_paid',
      render: (v: boolean) => v ? <Tag color="green">Paid</Tag> : <Tag color="orange">Unpaid</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, t) =>
        canManageTypes ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => openTypeModal(t)}>Edit</Button>
        ) : null,
    },
  ];

  const balanceColumns: ColumnsType<LeaveBalance> = [
    {
      title: 'Employee',
      dataIndex: 'user_id',
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Leave Type',
      key: 'leave_type',
      render: (_, b) => <Tag>{b.leave_type_name || b.leave_type_id}</Tag>,
    },
    { title: 'Year', dataIndex: 'leave_year' },
    { title: 'Allocated', dataIndex: 'allocated_days', render: (v) => `${v} days` },
    { title: 'Used', dataIndex: 'used_days', render: (v) => <Tag color="red">{v}d</Tag> },
    { title: 'Pending', dataIndex: 'pending_days', render: (v) => <Tag color="orange">{v}d</Tag> },
    {
      title: 'Remaining',
      key: 'remaining',
      render: (_, b) => {
        const rem = b.remaining_days ?? (b.allocated_days - b.used_days - b.pending_days);
        return <Tag color={rem > 0 ? 'green' : 'red'}>{rem}d</Tag>;
      },
    },
  ];

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map((y) => (
    <Select.Option key={y} value={y}>{y}</Select.Option>
  ));

  const paginatedRequests = requests.slice((reqPage - 1) * mobilePageSize, reqPage * mobilePageSize);
  const paginatedBalances = balances.slice((balPage - 1) * mobilePageSize, balPage * mobilePageSize);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ marginBottom: 4 }}>Leave Management</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>Review requests, manage leave types, and allocate balances</Text>

        <div style={{ marginTop: 16 }}>
          <Tabs
            defaultActiveKey="requests"
            items={[
              {
                key: 'requests',
                label: 'Leave Requests',
                children: (
                  <>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      <Select value={filterYear} onChange={setFilterYear} style={{ minWidth: 100, flex: isMobile ? 1 : undefined }}>
                        {yearOptions}
                      </Select>
                      <Select
                        placeholder="Filter by status"
                        allowClear
                        value={filterStatus}
                        onChange={setFilterStatus}
                        style={{ minWidth: 160, flex: isMobile ? 1 : undefined }}
                      >
                        {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
                          <Select.Option key={s} value={s}>{s}</Select.Option>
                        ))}
                      </Select>
                    </div>

                    {/* Desktop Table */}
                    <div className="admin-leave-table-desktop">
                      <Table
                        dataSource={requests}
                        columns={requestColumns}
                        rowKey="id"
                        loading={reqLoading}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 750 }}
                      />
                    </div>

                    {/* Mobile Card List */}
                    <div className="admin-leave-card-list">
                      {requests.length === 0 ? (
                        <Empty description="No leave requests found" style={{ padding: '24px 0' }} />
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {paginatedRequests.map((r) => (
                              <Card
                                key={r.id}
                                size="small"
                                style={{
                                  borderRadius: 12,
                                  border: '1px solid #e5e7eb',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                  <Text strong style={{ fontSize: 14 }}>{r.user_name}</Text>
                                  <Tag color={STATUS_COLOR[r.status]} style={{ fontWeight: 600 }}>{r.status}</Tag>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <Text type="secondary" style={{ fontSize: 12 }}>{r.employee_code}</Text>
                                  <Tag>{r.leave_type_name}</Tag>
                                </div>

                                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <Text style={{ fontWeight: 500 }}>
                                      {dayjs(r.start_date).format('DD MMM YYYY')} → {dayjs(r.end_date).format('DD MMM YYYY')}
                                    </Text>
                                    <Tag color="blue">{r.days_requested}d</Tag>
                                  </div>
                                  <div style={{ color: '#8c8c8c', fontSize: 11 }}>
                                    Applied: {dayjs(r.created_at).format('DD MMM YYYY')}
                                  </div>
                                  {r.reason && (
                                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e5e7eb', color: '#4b5563' }}>
                                      <Text type="secondary" style={{ fontSize: 11 }}>Reason: </Text>
                                      {r.reason}
                                    </div>
                                  )}
                                </div>

                                {canApprove && r.status === 'PENDING' && (
                                  <Button
                                    type="primary"
                                    ghost
                                    block
                                    onClick={() => openReview(r)}
                                    style={{ marginTop: 10, height: 38, borderRadius: 8, fontWeight: 500 }}
                                  >
                                    Review Request
                                  </Button>
                                )}
                              </Card>
                            ))}
                          </div>

                          <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <Pagination
                              simple
                              current={reqPage}
                              pageSize={mobilePageSize}
                              total={requests.length}
                              onChange={setReqPage}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: 'types',
                label: 'Leave Types',
                children: (
                  <>
                    {canManageTypes && (
                      <div style={{ marginBottom: 16 }}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => openTypeModal()}
                          block={isMobile}
                          style={isMobile ? { height: 40 } : undefined}
                        >
                          Add Leave Type
                        </Button>
                      </div>
                    )}

                    {/* Desktop Table */}
                    <div className="leave-type-table-desktop">
                      <Table
                        dataSource={leaveTypes}
                        columns={typeColumns}
                        rowKey="id"
                        loading={typesLoading}
                        pagination={false}
                        scroll={{ x: 600 }}
                      />
                    </div>

                    {/* Mobile Card List */}
                    <div className="leave-type-card-list">
                      {leaveTypes.length === 0 ? (
                        <Empty description="No leave types configured" style={{ padding: '24px 0' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {leaveTypes.map((t) => (
                            <Card
                              key={t.id}
                              size="small"
                              style={{
                                borderRadius: 12,
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text strong style={{ fontSize: 15 }}>{t.name}</Text>
                                <Tag style={{ fontWeight: 600 }}>{t.code}</Tag>
                              </div>

                              <div
                                style={{
                                  background: '#f9fafb',
                                  borderRadius: 8,
                                  padding: '8px 10px',
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr 1fr',
                                  gap: 8,
                                  fontSize: 12,
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Quota</Text>
                                  <Text strong>{t.annual_quota}d</Text>
                                </div>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Type</Text>
                                  {t.is_paid ? <Tag color="green">Paid</Tag> : <Tag color="orange">Unpaid</Tag>}
                                </div>
                                <div>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Status</Text>
                                  {t.is_active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>}
                                </div>
                              </div>

                              {canManageTypes && (
                                <Button
                                  icon={<EditOutlined />}
                                  block
                                  onClick={() => openTypeModal(t)}
                                  style={{ marginTop: 10, height: 38, borderRadius: 8 }}
                                >
                                  Edit Leave Type
                                </Button>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: 'balances',
                label: 'Leave Balances',
                children: (
                  <>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Select value={filterYear} onChange={setFilterYear} style={{ minWidth: 100, flex: isMobile ? 1 : undefined }}>
                        {yearOptions}
                      </Select>
                      {canManageTypes && (
                        <>
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() => setAllocModal(true)}
                            style={isMobile ? { flex: 1, minWidth: 140, height: 36 } : undefined}
                          >
                            Allocate Balance
                          </Button>
                          <Popconfirm
                            title={`Initialize all employee balances for ${filterYear}?`}
                            onConfirm={handleInitYear}
                            okText="Initialize"
                            cancelText="Cancel"
                          >
                            <Button loading={initYear} style={isMobile ? { width: '100%', height: 36 } : undefined}>
                              Initialize Year {filterYear}
                            </Button>
                          </Popconfirm>
                        </>
                      )}
                    </div>

                    {/* Desktop Table */}
                    <div className="leave-balance-table-desktop">
                      <Table
                        dataSource={balances}
                        columns={balanceColumns}
                        rowKey="id"
                        loading={balLoading}
                        pagination={{ pageSize: 15 }}
                        scroll={{ x: 700 }}
                      />
                    </div>

                    {/* Mobile Card List */}
                    <div className="leave-balance-card-list">
                      {balances.length === 0 ? (
                        <Empty description="No leave balances found" style={{ padding: '24px 0' }} />
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {paginatedBalances.map((b) => {
                              const rem = b.remaining_days ?? (b.allocated_days - b.used_days - b.pending_days);
                              return (
                                <Card
                                  key={b.id}
                                  size="small"
                                  style={{
                                    borderRadius: 12,
                                    border: '1px solid #e5e7eb',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <Tag style={{ fontSize: 13, fontWeight: 600 }}>{b.leave_type_name || b.leave_type_id}</Tag>
                                    <Tag color={rem > 0 ? 'green' : 'red'} style={{ fontWeight: 600 }}>
                                      {rem}d remaining
                                    </Tag>
                                  </div>

                                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8, wordBreak: 'break-all' }}>
                                    User ID: {b.user_id}
                                  </div>

                                  <div
                                    style={{
                                      background: '#f9fafb',
                                      borderRadius: 8,
                                      padding: '8px 10px',
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(4, 1fr)',
                                      gap: 6,
                                      fontSize: 12,
                                      textAlign: 'center',
                                    }}
                                  >
                                    <div>
                                      <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Year</Text>
                                      <Text strong style={{ fontSize: 12 }}>{b.leave_year}</Text>
                                    </div>
                                    <div>
                                      <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Allocated</Text>
                                      <Text strong style={{ fontSize: 12 }}>{b.allocated_days}d</Text>
                                    </div>
                                    <div>
                                      <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Used</Text>
                                      <Tag color="red" style={{ margin: 0 }}>{b.used_days}d</Tag>
                                    </div>
                                    <div>
                                      <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Pending</Text>
                                      <Tag color="orange" style={{ margin: 0 }}>{b.pending_days}d</Tag>
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}
                          </div>

                          <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <Pagination
                              simple
                              current={balPage}
                              pageSize={mobilePageSize}
                              total={balances.length}
                              onChange={setBalPage}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ),
              },
            ]}
          />
        </div>
      </Card>

      {/* Review Modal */}
      <Modal
        title={`Review Leave Request — ${reviewTarget?.user_name}`}
        open={reviewModal}
        onCancel={() => setReviewModal(false)}
        footer={null}
        destroyOnClose
        width={isMobile ? '92vw' : 520}
        centered
      >
        {reviewTarget && (
          <div style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={4}>
              <Text><b>Type:</b> {reviewTarget.leave_type_name}</Text>
              <Text>
                <b>Dates:</b> {dayjs(reviewTarget.start_date).format('DD MMM YYYY')} →{' '}
                {dayjs(reviewTarget.end_date).format('DD MMM YYYY')} ({reviewTarget.days_requested} days)
              </Text>
              {reviewTarget.reason && (
                <Text><b>Reason:</b> {reviewTarget.reason}</Text>
              )}
            </Space>
          </div>
        )}
        <Form form={reviewForm} layout="vertical" onFinish={handleReview}>
          <Form.Item
            name="action"
            label="Decision"
            rules={[{ required: true, message: 'Please select approve or reject' }]}
          >
            <Select placeholder="Select action">
              <Select.Option value="APPROVE">
                <Tag color="green" icon={<CheckOutlined />}>Approve</Tag>
              </Select.Option>
              <Select.Option value="REJECT">
                <Tag color="red" icon={<CloseOutlined />}>Reject</Tag>
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="reviewer_note" label="Note (optional)">
            <TextArea rows={3} placeholder="Add a note for the employee..." />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setReviewModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={reviewing}>
                Submit Decision
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Leave Type Modal */}
      <Modal
        title={editingType ? 'Edit Leave Type' : 'Create Leave Type'}
        open={typeModal}
        onCancel={() => setTypeModal(false)}
        footer={null}
        destroyOnClose
        width={isMobile ? '92vw' : 520}
        centered
      >
        <Form form={typeForm} layout="vertical" onFinish={handleSaveType}>
          {!editingType && (
            <Form.Item
              name="code"
              label="Code"
              rules={[
                { required: true, message: 'Code is required' },
                { max: 30, message: 'Code must be 30 characters or less' },
                {
                  pattern: /^[A-Z_]+$/,
                  message: 'Only uppercase letters and underscores allowed (e.g. ANNUAL_LEAVE)',
                },
              ]}
              extra="Use uppercase letters and underscores only — e.g. ANNUAL_LEAVE, SICK_LEAVE"
            >
              <Input
                placeholder="e.g. ANNUAL_LEAVE, SICK_LEAVE"
                onChange={(e) => {
                  const sanitized = e.target.value
                    .toUpperCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^A-Z_]/g, '');
                  typeForm.setFieldValue('code', sanitized);
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Annual Leave" />
          </Form.Item>
          <Form.Item name="annual_quota" label="Annual Quota (days)" rules={[{ required: true }]}>
            <InputNumber min={0} max={365} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_paid" label="Paid Leave" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="Paid" unCheckedChildren="Unpaid" />
          </Form.Item>
          {editingType && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setTypeModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={savingType}>
                {editingType ? 'Save Changes' : 'Create Type'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Allocate Modal */}
      <Modal
        title="Allocate Leave Balance"
        open={allocModal}
        onCancel={() => { setAllocModal(false); allocForm.resetFields(); }}
        footer={null}
        destroyOnClose
        width={isMobile ? '92vw' : 520}
        centered
      >
        <Form form={allocForm} layout="vertical" onFinish={handleAllocate}>
          <Form.Item name="user_id" label="User ID" rules={[{ required: true }]}>
            <Input placeholder="Employee user ID (UUID)" />
          </Form.Item>
          <Form.Item name="leave_type_id" label="Leave Type" rules={[{ required: true }]}>
            <Select placeholder="Select leave type">
              {leaveTypes.map((t) => (
                <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="leave_year" label="Year" initialValue={filterYear} rules={[{ required: true }]}>
            <InputNumber min={2020} max={2030} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="allocated_days" label="Allocated Days" rules={[{ required: true }]}>
            <InputNumber min={0} max={365} style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAllocModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={allocating}>Allocate</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
