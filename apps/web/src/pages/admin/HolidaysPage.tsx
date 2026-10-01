import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Typography,
  Tabs,
  DatePicker,
  Checkbox,
  Row,
  Col,
  Popconfirm,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Holiday, WeeklyHolidayRule } from '@workforce/shared';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getWeeklyHolidayRules,
  batchUpsertWeeklyRules,
} from '../../services/holidays.api.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Title, Text } = Typography;
const { TextArea } = Input;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Mobile card representing a single Holiday */
const HolidayCard: React.FC<{
  holiday: Holiday;
  canManage: boolean;
  deletingId: string | null;
  onEdit: (h: Holiday) => void;
  onDelete: (id: string) => void;
}> = ({ holiday, canManage, deletingId, onEdit, onDelete }) => (
  <Card
    size="small"
    style={{
      marginBottom: 12,
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }}
    styles={{ body: { padding: '14px 14px' } }}
  >
    {/* Top Row: Date & Status */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarOutlined style={{ color: '#1677ff', fontSize: 14 }} />
        <Text strong style={{ fontSize: 14 }}>
          {dayjs(holiday.holiday_date).format('DD MMM YYYY')}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          ({dayjs(holiday.holiday_date).format('dddd')})
        </Text>
      </div>

      <Tag color={holiday.is_active ? 'green' : 'default'} style={{ margin: 0 }}>
        {holiday.is_active ? 'Active' : 'Inactive'}
      </Tag>
    </div>

    {/* Holiday Name & Description */}
    <div style={{ margin: '6px 0 10px' }}>
      <Text strong style={{ fontSize: 15, color: '#111827' }}>
        {holiday.name}
      </Text>
      {holiday.description && (
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          {holiday.description}
        </div>
      )}
    </div>

    {/* Scope & Recurring Badges */}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: canManage ? 10 : 0 }}>
      {holiday.office_id ? (
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>Office-specific</Tag>
      ) : (
        <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>Company-wide</Tag>
      )}

      {holiday.is_recurring ? (
        <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>Yearly Recurring</Tag>
      ) : (
        <Tag style={{ margin: 0, fontSize: 11 }}>One-time</Tag>
      )}
    </div>

    {/* Actions */}
    {canManage && (
      <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
        <Button
          size="middle"
          icon={<EditOutlined />}
          onClick={() => onEdit(holiday)}
          style={{ flex: 1, borderRadius: 8 }}
        >
          Edit
        </Button>

        <Popconfirm
          title="Delete this holiday?"
          onConfirm={() => onDelete(holiday.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
        >
          <Button
            size="middle"
            danger
            icon={<DeleteOutlined />}
            loading={deletingId === holiday.id}
            style={{ flex: 1, borderRadius: 8 }}
          >
            Delete
          </Button>
        </Popconfirm>
      </div>
    )}
  </Card>
);

export const HolidaysPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const currentYear = dayjs().year();
  const canManage = hasPermission(PermissionKey.HOLIDAY_MANAGE);
  const isMobile = useIsMobile(768);

  // ─── Holidays ─────────────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [holidayModal, setHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm] = Form.useForm();
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [holidayDate, setHolidayDate] = useState<Dayjs | null>(null);

  // ─── Weekly Rules ─────────────────────────────────────────────────────────
  const [weeklyRules, setWeeklyRules] = useState<WeeklyHolidayRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [activeDays, setActiveDays] = useState<Set<number>>(new Set());
  const [savingRules, setSavingRules] = useState(false);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await getHolidays({ year: filterYear });
      setHolidays(res.data.data);
    } catch {
      message.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyRules = async () => {
    setRulesLoading(true);
    try {
      const res = await getWeeklyHolidayRules();
      setWeeklyRules(res.data.data);
      const active = new Set(
        res.data.data.filter((r) => r.is_active).map((r) => r.day_of_week)
      );
      setActiveDays(active);
    } catch {
      message.error('Failed to load weekly rules');
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [filterYear]);

  useEffect(() => {
    fetchWeeklyRules();
  }, []);

  // ─── Holiday CRUD ─────────────────────────────────────────────────────────
  const openHolidayModal = (h?: Holiday) => {
    setEditingHoliday(h || null);
    if (h) {
      holidayForm.setFieldsValue({
        name: h.name,
        description: h.description,
        is_recurring: h.is_recurring,
        is_active: h.is_active,
      });
      setHolidayDate(dayjs(h.holiday_date));
    } else {
      holidayForm.resetFields();
      setHolidayDate(null);
    }
    setHolidayModal(true);
  };

  const handleSaveHoliday = async (values: any) => {
    if (!holidayDate) {
      message.error('Please select a holiday date');
      return;
    }
    setSavingHoliday(true);
    try {
      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, {
          name: values.name,
          description: values.description,
          holiday_date: holidayDate.format('YYYY-MM-DD'),
          is_recurring: values.is_recurring ?? false,
          is_active: values.is_active ?? true,
        });
        message.success('Holiday updated');
      } else {
        await createHoliday({
          name: values.name,
          description: values.description,
          holiday_date: holidayDate.format('YYYY-MM-DD'),
          is_recurring: values.is_recurring ?? false,
        });
        message.success('Holiday created');
      }
      setHolidayModal(false);
      fetchHolidays();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save holiday');
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHoliday(id);
      message.success('Holiday deleted');
      fetchHolidays();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to delete holiday');
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Weekly Rules ─────────────────────────────────────────────────────────
  const toggleDay = (dayIndex: number) => {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) {
        next.delete(dayIndex);
      } else {
        next.add(dayIndex);
      }
      return next;
    });
  };

  const handleSaveWeeklyRules = async () => {
    setSavingRules(true);
    try {
      const rules = Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        week_of_month: null,
        is_active: activeDays.has(i),
      }));
      await batchUpsertWeeklyRules(rules);
      message.success('Weekly off days updated');
      fetchWeeklyRules();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save weekly rules');
    } finally {
      setSavingRules(false);
    }
  };

  // ─── Desktop Columns ───────────────────────────────────────────────────────
  const holidayColumns: ColumnsType<Holiday> = [
    {
      title: 'Date',
      dataIndex: 'holiday_date',
      key: 'date',
      render: (d: string) => (
        <Space>
          <CalendarOutlined />
          <Text strong>{dayjs(d).format('DD MMM YYYY')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>({dayjs(d).format('dddd')})</Text>
        </Space>
      ),
      sorter: (a, b) => a.holiday_date.localeCompare(b.holiday_date),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Name',
      dataIndex: 'name',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Scope',
      dataIndex: 'office_id',
      render: (v: string | null) =>
        v ? <Tag color="blue">Office-specific</Tag> : <Tag color="cyan">Company-wide</Tag>,
    },
    {
      title: 'Recurring',
      dataIndex: 'is_recurring',
      render: (v: boolean) => (v ? <Tag color="purple">Yearly</Tag> : <Tag>One-time</Tag>),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (v: boolean) => (v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
    ...(canManage
      ? [
          {
            title: 'Actions',
            key: 'actions',
            render: (_: any, h: Holiday) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openHolidayModal(h)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this holiday?"
                  onConfirm={() => handleDeleteHoliday(h.id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deletingId === h.id}
                  >
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 22 }}>
          <CalendarOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Holiday Calendar
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Manage official company holidays and weekly off days
        </Text>
      </div>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: isMobile ? '12px 14px' : '16px 20px' } }}>
        <Tabs
          defaultActiveKey="holidays"
          items={[
            {
              key: 'holidays',
              label: 'Public Holidays',
              children: (
                <>
                  {/* Filter & Action Controls */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <DatePicker
                        picker="year"
                        value={dayjs().year(filterYear)}
                        onChange={(d) => d && setFilterYear(d.year())}
                        allowClear={false}
                        size={isMobile ? 'middle' : 'middle'}
                        style={{ width: 110 }}
                      />
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} in {filterYear}
                      </Text>
                    </div>

                    {canManage && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => openHolidayModal()}
                        size="middle"
                        style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
                      >
                        Add Holiday
                      </Button>
                    )}
                  </div>

                  {/* ── Mobile View: Holiday Cards ── */}
                  <div className="holiday-card-list">
                    {holidays.length === 0 && !loading ? (
                      <Empty description={`No holidays found for ${filterYear}`} style={{ padding: '24px 0' }} />
                    ) : (
                      holidays.map((h) => (
                        <HolidayCard
                          key={h.id}
                          holiday={h}
                          canManage={canManage}
                          deletingId={deletingId}
                          onEdit={openHolidayModal}
                          onDelete={handleDeleteHoliday}
                        />
                      ))
                    )}
                  </div>

                  {/* ── Desktop View: Full Table ── */}
                  <div className="holiday-table-desktop">
                    <Table
                      dataSource={holidays}
                      columns={holidayColumns}
                      rowKey="id"
                      loading={loading}
                      scroll={{ x: 750 }}
                      pagination={{ pageSize: 15 }}
                      locale={{ emptyText: <Empty description={`No holidays found for ${filterYear}`} /> }}
                    />
                  </div>
                </>
              ),
            },
            {
              key: 'weekly',
              label: 'Weekly Off Days',
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                    Configure which days of the week are non-working days for the company.
                  </Text>

                  {rulesLoading ? (
                    <Text>Loading weekly schedule...</Text>
                  ) : (
                    <Row gutter={[10, 10]} style={{ marginBottom: 20 }}>
                      {DAY_NAMES.map((name, idx) => {
                        const isSelected = activeDays.has(idx);
                        return (
                          <Col key={idx} xs={12} sm={8} md={6} lg={4}>
                            <button
                              type="button"
                              disabled={!canManage}
                              onClick={() => canManage && toggleDay(idx)}
                              style={{
                                width: '100%',
                                minHeight: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: isSelected ? '2px solid #1677ff' : '1px solid #e5e7eb',
                                background: isSelected ? '#eff6ff' : '#ffffff',
                                cursor: canManage ? 'pointer' : 'default',
                                transition: 'all 0.15s ease',
                                outline: 'none',
                                userSelect: 'none',
                              }}
                            >
                              <Checkbox
                                checked={isSelected}
                                disabled={!canManage}
                                style={{ pointerEvents: 'none' }}
                              />
                              <Text strong style={{ fontSize: 14, color: isSelected ? '#1677ff' : '#1e293b' }}>
                                {name}
                              </Text>
                            </button>
                          </Col>
                        );
                      })}
                    </Row>
                  )}

                  {canManage && (
                    <Button
                      type="primary"
                      size="large"
                      loading={savingRules}
                      onClick={handleSaveWeeklyRules}
                      style={{ borderRadius: 8, width: isMobile ? '100%' : 'auto' }}
                    >
                      Save Weekly Rules
                    </Button>
                  )}

                  {weeklyRules.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Current non-working days:{' '}
                        <strong>
                          {[...new Set(weeklyRules.filter((r) => r.is_active).map((r) => DAY_NAMES[r.day_of_week]))].join(', ') || 'None'}
                        </strong>
                      </Text>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Holiday Add/Edit Modal */}
      <Modal
        title={editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
        open={holidayModal}
        onCancel={() => {
          setHolidayModal(false);
          setHolidayDate(null);
          holidayForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        centered
        width={isMobile ? '92vw' : 480}
      >
        <Form form={holidayForm} layout="vertical" onFinish={handleSaveHoliday}>
          <Form.Item name="name" label="Holiday Name" rules={[{ required: true, message: 'Holiday name is required' }]}>
            <Input placeholder="e.g. Republic Day" size="large" />
          </Form.Item>

          <Form.Item label="Date" required>
            <DatePicker
              style={{ width: '100%' }}
              size="large"
              value={holidayDate}
              onChange={(d) => setHolidayDate(d)}
              format="DD MMM YYYY"
            />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Optional holiday notes" size="large" />
          </Form.Item>

          <Form.Item name="is_recurring" label="Recurring Yearly" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Yes" unCheckedChildren="No" />
          </Form.Item>

          {editingHoliday && (
            <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() => setHolidayModal(false)}
              size="large"
              style={{ flex: 1, borderRadius: 8 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={savingHoliday}
              size="large"
              style={{ flex: 1.5, borderRadius: 8 }}
            >
              {editingHoliday ? 'Save Changes' : 'Add Holiday'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
