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

const { Title, Text } = Typography;
const { TextArea } = Input;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const HolidaysPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const currentYear = dayjs().year();
  const canManage = hasPermission(PermissionKey.HOLIDAY_MANAGE);

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
  // Local edit state: { day_of_week: 0-6 } → is_active
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

  // ─── Weekly Rules Save ────────────────────────────────────────────────────
  const handleSaveWeeklyRules = async () => {
    setSavingRules(true);
    try {
      const rules = Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        week_of_month: null,
        is_active: activeDays.has(i),
      }));
      await batchUpsertWeeklyRules(rules);
      message.success('Weekly holiday rules saved');
      fetchWeeklyRules();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to save weekly rules');
    } finally {
      setSavingRules(false);
    }
  };

  const toggleDay = (day: number) => {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  // ─── Columns ──────────────────────────────────────────────────────────────
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
      render: (v: boolean) => v ? <Tag color="purple">Yearly</Tag> : <Tag>One-time</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
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
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Holiday Calendar
        </Title>
        <Text type="secondary">Manage company holidays and weekly off days</Text>

        <div style={{ marginTop: 16 }}>
          <Tabs
            defaultActiveKey="holidays"
            items={[
              {
                key: 'holidays',
                label: 'Public Holidays',
                children: (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                      <Space>
                        <DatePicker
                          picker="year"
                          value={dayjs().year(filterYear)}
                          onChange={(d) => d && setFilterYear(d.year())}
                          allowClear={false}
                        />
                        <Text type="secondary">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''} in {filterYear}</Text>
                      </Space>
                      {canManage && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openHolidayModal()}>
                          Add Holiday
                        </Button>
                      )}
                    </div>

                    <Table
                      dataSource={holidays}
                      columns={holidayColumns}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 15 }}
                      locale={{ emptyText: <Empty description={`No holidays found for ${filterYear}`} /> }}
                    />
                  </>
                ),
              },
              {
                key: 'weekly',
                label: 'Weekly Off Days',
                children: (
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      Configure which days of the week are non-working days for the company.
                    </Text>

                    {rulesLoading ? (
                      <Text>Loading...</Text>
                    ) : (
                      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                        {DAY_NAMES.map((name, idx) => (
                          <Col key={idx} xs={12} sm={8} md={6} lg={4}>
                            <Card
                              size="small"
                              style={{
                                borderRadius: 8,
                                border: activeDays.has(idx) ? '2px solid #1677ff' : undefined,
                                background: activeDays.has(idx) ? '#e6f4ff' : undefined,
                                textAlign: 'center',
                                cursor: canManage ? 'pointer' : 'default',
                              }}
                              onClick={() => canManage && toggleDay(idx)}
                            >
                              <Checkbox
                                checked={activeDays.has(idx)}
                                onChange={() => canManage && toggleDay(idx)}
                                disabled={!canManage}
                              >
                                <Text strong>{name}</Text>
                              </Checkbox>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    )}

                    {canManage && (
                      <Button
                        type="primary"
                        loading={savingRules}
                        onClick={handleSaveWeeklyRules}
                      >
                        Save Weekly Rules
                      </Button>
                    )}

                    {weeklyRules.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <Text type="secondary">
                          Current off days:{' '}
                          {weeklyRules
                            .filter((r) => r.is_active)
                            .map((r) => DAY_NAMES[r.day_of_week])
                            .join(', ') || 'None'}
                        </Text>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
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
      >
        <Form form={holidayForm} layout="vertical" onFinish={handleSaveHoliday}>
          <Form.Item name="name" label="Holiday Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Republic Day" />
          </Form.Item>

          <Form.Item label="Date" required>
            <DatePicker
              style={{ width: '100%' }}
              value={holidayDate}
              onChange={(d) => setHolidayDate(d)}
              format="DD MMM YYYY"
            />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Optional description" />
          </Form.Item>

          <Form.Item name="is_recurring" label="Recurring Yearly" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Yes" unCheckedChildren="No" />
          </Form.Item>

          {editingHoliday && (
            <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          )}

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setHolidayModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={savingHoliday}>
                {editingHoliday ? 'Save Changes' : 'Add Holiday'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
