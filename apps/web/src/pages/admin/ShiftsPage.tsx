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
  InputNumber,
  Select,
  Switch,
  TimePicker,
  message,
  Typography,
  Popconfirm,
  Empty,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { WorkShift, ShiftBreak, Office, ApiResponse } from '@workforce/shared';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
} from '../../services/shifts.api.js';
import { PermissionGate } from '../../components/common/PermissionGate.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';

const { Title, Text } = Typography;

interface ShiftFormValues {
  name: string;
  office_id?: string | null;
  start_time: Dayjs;
  end_time: Dayjs;
  total_hours: number;
  is_default: boolean;
  breaks: Array<{
    name: string;
    start_time: Dayjs;
    end_time: Dayjs;
    duration_minutes: number;
    is_paid?: boolean;
  }>;
}

export const ShiftsPage: React.FC = () => {
  const isMobile = useIsMobile(768);
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PermissionKey.SHIFT_MANAGE);

  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null);

  const [form] = Form.useForm<ShiftFormValues>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shiftsRes, officesRes] = await Promise.all([
        getShifts(),
        api.get<ApiResponse<Office[]>>('/offices'),
      ]);
      setShifts(shiftsRes.data.data);
      setOffices(officesRes.data.data);
    } catch {
      message.error('Failed to load work shifts and break schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setEditingShift(null);
    form.resetFields();
    form.setFieldsValue({
      name: 'Standard 8-Hour Shift',
      office_id: null,
      start_time: dayjs('09:00', 'HH:mm'),
      end_time: dayjs('17:00', 'HH:mm'),
      total_hours: 8.0,
      is_default: false,
      breaks: [
        {
          name: 'Lunch Break',
          start_time: dayjs('13:00', 'HH:mm'),
          end_time: dayjs('14:00', 'HH:mm'),
          duration_minutes: 60,
          is_paid: false,
        },
      ],
    });
    setModalVisible(true);
  };

  const handleOpenEdit = (shift: WorkShift) => {
    setEditingShift(shift);
    form.resetFields();
    form.setFieldsValue({
      name: shift.name,
      office_id: shift.office_id || null,
      start_time: dayjs(shift.start_time, 'HH:mm'),
      end_time: dayjs(shift.end_time, 'HH:mm'),
      total_hours: shift.total_hours,
      is_default: shift.is_default,
      breaks: (shift.breaks || []).map((b) => ({
        name: b.name,
        start_time: dayjs(b.start_time, 'HH:mm'),
        end_time: dayjs(b.end_time, 'HH:mm'),
        duration_minutes: b.duration_minutes,
        is_paid: b.is_paid,
      })),
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const formattedBreaks = (values.breaks || []).map((b) => ({
        name: b.name,
        start_time: b.start_time.format('HH:mm'),
        end_time: b.end_time.format('HH:mm'),
        duration_minutes: Number(b.duration_minutes),
        is_paid: Boolean(b.is_paid),
      }));

      const payload = {
        name: values.name,
        office_id: values.office_id || null,
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        total_hours: Number(values.total_hours),
        is_default: Boolean(values.is_default),
        breaks: formattedBreaks,
      };

      if (editingShift) {
        await updateShift(editingShift.id, payload);
        message.success(`Work shift "${payload.name}" updated successfully`);
      } else {
        await createShift(payload);
        message.success(`Work shift "${payload.name}" created successfully`);
      }

      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      if (err.errorFields) return; // Validation error in form
      message.error(err.response?.data?.error?.message || 'Failed to save work shift schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteShift(id);
      message.success('Work shift deleted');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error?.message || 'Failed to delete work shift');
    } finally {
      setDeletingId(null);
    }
  };

  // Auto calculate break duration when start/end changes
  const handleBreakTimeChange = (index: number) => {
    const currentBreaks = form.getFieldValue('breaks') || [];
    const b = currentBreaks[index];
    if (b && b.start_time && b.end_time) {
      let diff = b.end_time.diff(b.start_time, 'minute');
      if (diff < 0) diff += 24 * 60; // Crosses midnight
      if (diff > 0) {
        currentBreaks[index].duration_minutes = diff;
        form.setFieldsValue({ breaks: [...currentBreaks] });
      }
    }
  };

  const columns = [
    {
      title: 'Shift Name',
      key: 'name',
      render: (_: any, r: WorkShift) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{r.name}</span>
            {r.is_default && <Tag color="blue">Default</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>
            <EnvironmentOutlined style={{ marginRight: 4 }} />
            {r.office_name ? r.office_name : 'All Offices (Company Default)'}
          </div>
        </div>
      ),
    },
    {
      title: 'Office Hours',
      key: 'hours',
      render: (_: any, r: WorkShift) => (
        <div>
          <span style={{ fontWeight: 600, color: '#1d1d1f' }}>{r.total_hours} hrs</span>
          <div style={{ fontSize: 12, color: '#6e6e73' }}>
            {r.start_time} – {r.end_time}
          </div>
        </div>
      ),
    },
    {
      title: 'Scheduled Breaks',
      key: 'breaks',
      render: (_: any, r: WorkShift) => {
        const breaks = r.breaks || [];
        if (breaks.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>No breaks configured</Text>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {breaks.map((b, idx) => (
              <div
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  background: '#f5f5f7',
                  padding: '3px 8px',
                  borderRadius: 6,
                  width: 'fit-content',
                }}
              >
                <CoffeeOutlined style={{ color: '#ff9500', fontSize: 11 }} />
                <span style={{ fontWeight: 500, color: '#1d1d1f' }}>{b.name}:</span>
                <span style={{ color: '#6e6e73' }}>
                  {b.start_time} – {b.end_time} ({b.duration_minutes}m)
                </span>
                {b.is_paid && <Tag color="green" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>Paid</Tag>}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: WorkShift) => (
        <Space size="small">
          <PermissionGate permission={PermissionKey.SHIFT_MANAGE}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(r)}
            >
              Edit
            </Button>
            <Popconfirm
              title="Delete Shift"
              description={`Delete "${r.name}"? Employees using this shift will fall back to company default.`}
              onConfirm={() => handleDelete(r.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true, loading: deletingId === r.id }}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === r.id}
              />
            </Popconfirm>
          </PermissionGate>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 24 }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 22 }}>
            <ClockCircleOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Office Work Shifts & Breaks
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Configure daily office working hours, target login duration, and scheduled break intervals
          </Text>
        </div>

        <PermissionGate permission={PermissionKey.SHIFT_MANAGE}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAdd}
            style={{ borderRadius: 8 }}
          >
            Add Work Shift
          </Button>
        </PermissionGate>
      </div>

      {/* ── Mobile View: Shift Cards ── */}
      {isMobile ? (
        <div className="shift-cards-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shifts.length === 0 && !loading ? (
            <Card style={{ borderRadius: 12, textAlign: 'center', padding: '24px 0' }}>
              <Empty description="No work shifts configured" />
            </Card>
          ) : (
            shifts.map((s) => (
              <Card
                key={s.id}
                size="small"
                style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                styles={{ body: { padding: '14px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1d1d1f' }}>
                      {s.name}
                      {s.is_default && <Tag color="blue" style={{ marginLeft: 6 }}>Default</Tag>}
                    </div>
                    <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>
                      {s.office_name ? s.office_name : 'All Offices (Company Default)'}
                    </div>
                  </div>
                  {canManage && (
                    <Space size="small">
                      <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(s)} />
                      <Popconfirm
                        title="Delete Shift?"
                        onConfirm={() => handleDelete(s.id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  )}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#86868b', display: 'block' }}>DAILY WORK HOURS</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1d1d1f' }}>{s.total_hours} hrs</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#86868b', display: 'block' }}>SHIFT TIMING</span>
                    <span style={{ fontSize: 13, color: '#1d1d1f' }}>{s.start_time} – {s.end_time}</span>
                  </div>
                </div>

                {/* Breaks */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 11, color: '#86868b', display: 'block', marginBottom: 6 }}>
                    SCHEDULED BREAKS ({(s.breaks || []).length})
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(s.breaks || []).length > 0 ? (
                      s.breaks?.map((b, idx) => (
                        <Tag key={idx} icon={<CoffeeOutlined />} color="orange">
                          {b.name}: {b.start_time} – {b.end_time} ({b.duration_minutes}m)
                        </Tag>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: '#86868b' }}>No breaks configured</span>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        /* ── Desktop View: Table ── */
        <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px' } }}>
          <Table
            dataSource={shifts}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={false}
            locale={{ emptyText: <Empty description="No work shifts configured" /> }}
          />
        </Card>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        title={editingShift ? `Edit Shift: ${editingShift.name}` : 'Create New Office Shift'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={isMobile ? '96vw' : 680}
        centered
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Shift Schedule Name"
            rules={[{ required: true, message: 'Please enter a name for this shift schedule' }]}
          >
            <Input placeholder="e.g. Standard 8-Hour Day Shift" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <Form.Item name="office_id" label="Office Assignment">
              <Select placeholder="Select Office (or Company Default)">
                <Select.Option value={null}>🏢 All Offices (Company Default)</Select.Option>
                {offices.map((off) => (
                  <Select.Option key={off.id} value={off.id}>
                    📍 {off.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="total_hours"
              label="Daily Office Work Hours"
              rules={[{ required: true, message: 'Please enter total work hours' }]}
              extra="Target logged-in time for employees on this shift (e.g. 8.0 hrs)"
            >
              <InputNumber min={1} max={24} step={0.5} style={{ width: '100%' }} addonAfter="Hours" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="start_time"
              label="Shift Start Time"
              rules={[{ required: true, message: 'Please pick shift start time' }]}
            >
              <TimePicker format="HH:mm" style={{ width: '100%' }} needConfirm={false} />
            </Form.Item>

            <Form.Item
              name="end_time"
              label="Shift End Time"
              rules={[{ required: true, message: 'Please pick shift end time' }]}
            >
              <TimePicker format="HH:mm" style={{ width: '100%' }} needConfirm={false} />
            </Form.Item>
          </div>

          <Form.Item name="is_default" valuePropName="checked">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch checked={form.getFieldValue('is_default')} onChange={(val) => form.setFieldsValue({ is_default: val })} />
              <div>
                <span style={{ fontWeight: 500, color: '#1d1d1f' }}>Set as Default Shift</span>
                <span style={{ display: 'block', fontSize: 12, color: '#86868b' }}>
                  Employees without a custom office shift will automatically be assigned this schedule.
                </span>
              </div>
            </div>
          </Form.Item>

          <Divider style={{ margin: '16px 0 12px 0' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>
              <CoffeeOutlined style={{ marginRight: 6, color: '#ff9500' }} />
              Scheduled Break Intervals
            </span>
          </Divider>

          <div style={{ fontSize: 12, color: '#86868b', marginBottom: 12 }}>
            Define scheduled breaks (e.g. lunch hour, morning tea, afternoon rest) and their duration.
          </div>

          {/* Dynamic Breaks Form List */}
          <Form.List name="breaks">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }, index) => (
                  <div
                    key={key}
                    style={{
                      background: '#f9f9fb',
                      border: '1px solid #ebebef',
                      borderRadius: 10,
                      padding: '12px 14px',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#1d1d1f' }}>
                        Break Slot #{index + 1}
                      </span>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1.2fr 1.2fr 1fr', gap: 10, alignItems: 'start' }}>
                      <Form.Item
                        {...restField}
                        name={[name, 'name']}
                        rules={[{ required: true, message: 'Break name required' }]}
                        style={{ margin: 0 }}
                      >
                        <Input placeholder="e.g. Lunch Break" />
                      </Form.Item>

                      <Form.Item
                        {...restField}
                        name={[name, 'start_time']}
                        rules={[{ required: true, message: 'Start required' }]}
                        style={{ margin: 0 }}
                      >
                        <TimePicker
                          format="HH:mm"
                          placeholder="From"
                          style={{ width: '100%' }}
                          needConfirm={false}
                          onChange={() => handleBreakTimeChange(name)}
                        />
                      </Form.Item>

                      <Form.Item
                        {...restField}
                        name={[name, 'end_time']}
                        rules={[{ required: true, message: 'End required' }]}
                        style={{ margin: 0 }}
                      >
                        <TimePicker
                          format="HH:mm"
                          placeholder="To"
                          style={{ width: '100%' }}
                          needConfirm={false}
                          onChange={() => handleBreakTimeChange(name)}
                        />
                      </Form.Item>

                      <Form.Item
                        {...restField}
                        name={[name, 'duration_minutes']}
                        rules={[{ required: true, message: 'Mins' }]}
                        style={{ margin: 0 }}
                      >
                        <InputNumber
                          min={1}
                          max={300}
                          placeholder="Mins"
                          addonAfter="m"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <Form.Item
                        {...restField}
                        name={[name, 'is_paid']}
                        valuePropName="checked"
                        style={{ margin: 0 }}
                      >
                        <Switch
                          size="small"
                          checked={form.getFieldValue(['breaks', name, 'is_paid'])}
                          onChange={(val) => {
                            const b = form.getFieldValue('breaks');
                            b[name].is_paid = val;
                            form.setFieldsValue({ breaks: [...b] });
                          }}
                        />
                        <span style={{ fontSize: 12, marginLeft: 8, color: '#6e6e73' }}>
                          Count this break as paid working time
                        </span>
                      </Form.Item>
                    </div>
                  </div>
                ))}

                <Button
                  type="dashed"
                  onClick={() =>
                    add({
                      name: 'Tea Break',
                      start_time: dayjs('16:00', 'HH:mm'),
                      end_time: dayjs('16:15', 'HH:mm'),
                      duration_minutes: 15,
                      is_paid: false,
                    })
                  }
                  block
                  icon={<PlusOutlined />}
                  style={{ borderRadius: 8, marginTop: 4 }}
                >
                  Add Break Slot
                </Button>
              </>
            )}
          </Form.List>

          <div style={{ display: 'flex', gap: 10, marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Button size="large" onClick={() => setModalVisible(false)} style={{ flex: 1, borderRadius: 8 }}>
              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              loading={saving}
              onClick={handleSubmit}
              style={{ flex: 1.5, borderRadius: 8 }}
            >
              {editingShift ? 'Save Shift Changes' : 'Create Shift Schedule'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
